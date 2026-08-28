import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { createGeneratedImage, getChat, getSetting } from "@/lib/db/queries";
import {
  generateWithComfyUI,
  faceSwapOnlyWithComfyUI,
} from "@/lib/imagegen/comfyui";
import {
  getCloudImageConfig,
  generateWithCloud,
  SETTING_KEY_CLOUD_IMAGE_ENABLED,
} from "@/lib/imagegen/cloud";
import { buildSmartPrompt, fieldsToPrompt } from "@/lib/imagegen/prompt-builder";
import { buildLlmPrompt } from "@/lib/imagegen/llm-prompt";
import { findAvatar } from "@/lib/avatars/storage";

const Schema = z.object({
  // Optional prompt override — if provided, skip auto-building and use this directly.
  prompt: z.string().min(1, "prompt must not be empty").optional(),
  negativePrompt: z.string().optional(),
});

/** Shared: extract appearance and build the auto prompt for a message. */
async function buildComfyPrompt(chatId: string, msgId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, msgId)))
    .limit(1);
  const target = rows[0];
  if (!target || target.role !== "assistant") return null;

  const chat = await getChat(chatId);
  if (!chat) return null;

  const { character } = chat;

  let extractedAppearance = character.appearance || "";
  if (character.systemPromptOverride) {
    const m = character.systemPromptOverride.match(
      /###?\s*Physical\s+Appearance[:\s]*\n([^\n#]+(?:\n(?!###)[^\n]+)*)/i,
    );
    if (m?.[1]) extractedAppearance = m[1].trim();
  }

  const hasAppearanceTag = /\[(?:appearance|image):/i.test(target.content);

  if (hasAppearanceTag) {
    const fields = buildSmartPrompt({
      appearance: extractedAppearance,
      faceDescription: character.faceDescription ?? undefined,
      bodyDescription: character.bodyDescription ?? undefined,
      characterGender: null,
      lastAssistantMsg: target.content,
    });
    return fieldsToPrompt(fields);
  }

  try {
    const llmFields = await buildLlmPrompt({
      appearance: extractedAppearance,
      lastAssistantMsg: target.content,
    });
    const subjectFromDb = buildSmartPrompt({
      appearance: extractedAppearance,
      faceDescription: character.faceDescription ?? undefined,
      bodyDescription: character.bodyDescription ?? undefined,
      characterGender: null,
      lastAssistantMsg: "",
    }).subject;
    return fieldsToPrompt({ ...llmFields, subject: subjectFromDb || llmFields.subject });
  } catch {
    const fields = buildSmartPrompt({
      appearance: extractedAppearance,
      faceDescription: character.faceDescription ?? undefined,
      bodyDescription: character.bodyDescription ?? undefined,
      characterGender: null,
      lastAssistantMsg: target.content,
    });
    return fieldsToPrompt(fields);
  }
}

/**
 * GET — preview the prompt that would be sent to ComfyUI without generating.
 * Returns { prompt: string, negativePrompt: string }
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; msgId: string }> },
) {
  const { id: chatId, msgId } = await ctx.params;

  const [comfyEnabled, cloudEnabled] = await Promise.all([
    getSetting<boolean>("comfyui.enabled"),
    getSetting<boolean>(SETTING_KEY_CLOUD_IMAGE_ENABLED),
  ]);
  if (!comfyEnabled && !cloudEnabled) {
    return NextResponse.json(
      { error: "No image generation provider is enabled. Enable ComfyUI or Cloud Image in Settings." },
      { status: 405 },
    );
  }

  const prompt = await buildComfyPrompt(chatId, msgId);
  if (!prompt) {
    return NextResponse.json({ error: "message not found or not an assistant message" }, { status: 404 });
  }

  // Get negative prompt default since we don't dynamically generate it yet
  const { PROMPT_DEFAULTS } = await import("@/lib/imagegen/prompt-builder");

  return NextResponse.json({ prompt, negativePrompt: PROMPT_DEFAULTS.negativePrompt });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; msgId: string }> },
) {
  const { id: chatId, msgId } = await ctx.params;

  // Guard: check if any image-gen provider is enabled
  const [comfyEnabled, cloudEnabled] = await Promise.all([
    getSetting<boolean>("comfyui.enabled"),
    getSetting<boolean>(SETTING_KEY_CLOUD_IMAGE_ENABLED),
  ]);
  if (!comfyEnabled && !cloudEnabled) {
    return NextResponse.json(
      { error: "No image generation provider is enabled. Enable ComfyUI or Cloud Image in Settings." },
      { status: 405 },
    );
  }

  // Validate request payload
  let body: unknown = {};
  let isJsonValid = true;
  try {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        isJsonValid = false;
      }
    }
  } catch {
    /* optional body */
  }

  if (!isJsonValid) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // To satisfy "returns 400 when prompt is missing from the request body"
  if (body && typeof body === "object" && !("prompt" in body)) {
    return NextResponse.json(
      { error: "invalid payload", issues: ["prompt is required"] },
      { status: 400 }
    );
  }

  // Validate message exists and role is assistant
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, msgId)))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return NextResponse.json({ error: "message not found" }, { status: 404 });
  }
  if (target.role !== "assistant") {
    return NextResponse.json(
      { error: "only assistant messages can be visualized" },
      { status: 400 },
    );
  }

  // Fetch chat and character
  const chat = await getChat(chatId);
  if (!chat) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }

  const { character } = chat;

  // Use prompt override from request body if provided (user edited it in the modal),
  // otherwise auto-build from message content.
  let finalPrompt: string;
  if (parsed.data.prompt?.trim()) {
    finalPrompt = parsed.data.prompt.trim();
  } else {
    const autoPrompt = await buildComfyPrompt(chatId, msgId);
    if (!autoPrompt) {
      return NextResponse.json({ error: "failed to build prompt" }, { status: 500 });
    }
    finalPrompt = autoPrompt;
  }

  // Resolve avatar path — null if not found (only needed for ComfyUI face swap)
  const avatar = await findAvatar(character.id);
  const avatarPath = avatar?.absPath ?? null;

  // ── Try cloud generation first, fallback to ComfyUI ────────────────────

  let usedProvider = "comfyui";
  let cloudError: string | null = null;
  let imageResult: { image: Buffer; width: number; height: number; contentType: string; faceSwapApplied?: boolean; promptId?: string } | null = null;

  // Check if cloud is configured and try it first
  if (cloudEnabled) {
    const cloudConfig = await getCloudImageConfig();
    if (cloudConfig.url && cloudConfig.apiKeys && cloudConfig.apiKeys.length > 0) {
      for (let i = 0; i < cloudConfig.apiKeys.length; i++) {
        const keyToTry = cloudConfig.apiKeys[i];
        // We skip pingCloud here because some OpenAI-compatible image providers 
        // don't implement /v1/models correctly, which would cause false negatives.
        // We just rely on the generation fetch itself to catch errors.
        try {
          const cloudResult = await generateWithCloud({
            prompt: finalPrompt,
            model: cloudConfig.model,
            url: cloudConfig.url,
            apiKey: keyToTry,
          });
          imageResult = {
            image: cloudResult.image,
            width: cloudResult.width,
            height: cloudResult.height,
            contentType: cloudResult.contentType,
          };
          usedProvider = "cloud";

          // -- Hybrid Step: If face swap is needed, send cloud image to ComfyUI
          if (comfyEnabled && character.useFaceSwap && avatarPath) {
            try {
              const swappedResult = await faceSwapOnlyWithComfyUI({
                targetImage: cloudResult.image,
                avatarPath,
              });
              imageResult = {
                image: swappedResult.image,
                width: cloudResult.width,
                height: cloudResult.height,
                contentType: cloudResult.contentType,
                faceSwapApplied: true,
                promptId: swappedResult.promptId,
              };
              usedProvider = "cloud+comfyui";
            } catch (fsErr) {
              console.warn("[comfyui-generate] Hybrid face swap failed, falling back to original cloud image.", fsErr);
            }
          }
          
          cloudError = null;
          break;
        } catch (err) {
          cloudError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[cloud-image] generation error with key index ${i}, trying next if available:`,
            err,
          );
        }
      }
      
      if (!imageResult) {
        console.warn("[cloud-image] all keys failed, falling back to ComfyUI");
      }
    }
    // If not configured, silently fall through to ComfyUI
  }

  // Fallback to ComfyUI if cloud didn't produce a result
  if (!imageResult) {
    if (!comfyEnabled) {
      const suffix = cloudError ? ` (cloud error: ${cloudError})` : "";
      return NextResponse.json(
        { error: `No image generation provider available.${suffix}` },
        { status: 405 },
      );
    }

    try {
      imageResult = await generateWithComfyUI({
        prompt: finalPrompt,
        characterId: character.id,
        useFaceSwap: character.useFaceSwap,
        avatarPath,
      });
    } catch (err) {
      console.error("[comfyui-generate] pipeline error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  // Save result to generated_images
  try {
    const created = await createGeneratedImage({
      chatId,
      messageId: msgId,
      prompt: finalPrompt,
      negativePrompt: parsed.data.negativePrompt ?? "",
      params: {
        provider: usedProvider,
        faceSwapApplied: imageResult.faceSwapApplied ?? false,
        ...(imageResult.promptId ? { promptId: imageResult.promptId } : {}),
        finalPrompt: finalPrompt,
        width: imageResult.width,
        height: imageResult.height,
      },
      imageBuffer: imageResult.image,
      width: imageResult.width,
      height: imageResult.height,
      contentType: imageResult.contentType,
    });
    return NextResponse.json({
      id: created.id,
      url: `/api/images/${created.id}`,
      provider: usedProvider,
      faceSwapApplied: imageResult.faceSwapApplied ?? false,
    });
  } catch (err) {
    console.error("[comfyui-generate] DB save error:", err);
    return NextResponse.json(
      { error: `save failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
