import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_COMFYUI_CHECKPOINT,
  DEFAULT_COMFYUI_OUTPUT_PATH,
  DEBUG_COMFYUI_WORKFLOW_PATH,
  getComfyUIConfig,
  generateWithComfyUI,
} from "@/lib/imagegen/comfyui";
import {
  getCloudImageConfig,
  generateWithCloud,
} from "@/lib/imagegen/cloud";

const requestSchema = z.object({
  positivePrompt: z.string().trim().min(1).max(4000),
  negativePrompt: z.string().max(4000).optional().default(""),
  checkpoint: z.string().trim().max(500).optional(),
  provider: z.enum(["comfyui", "cloud", "auto"]).optional().default("comfyui"),
});

export const dynamic = "force-dynamic";

/** Run debug image generation with provider selection (ComfyUI / Cloud / Auto). */
export async function POST(request: Request) {
  const comfyConfig = await getComfyUIConfig();
  const cloudConfig = await getCloudImageConfig();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid prompt" },
      { status: 400 },
    );
  }

  const { positivePrompt, negativePrompt, checkpoint, provider } = parsed.data;

  // ── Provider: cloud ──────────────────────────────────────────────────────
  if (provider === "cloud") {
    if (!cloudConfig.enabled || !cloudConfig.url || !cloudConfig.apiKeys || cloudConfig.apiKeys.length === 0) {
      return NextResponse.json(
        { error: "Cloud image generation is not configured. Enable it in Settings." },
        { status: 405 },
      );
    }

    let lastErr = new Error("No API keys available");
    for (let i = 0; i < cloudConfig.apiKeys.length; i++) {
      const keyToTry = cloudConfig.apiKeys[i];
      try {
        const result = await generateWithCloud({
          prompt: positivePrompt,
          model: cloudConfig.model,
          url: cloudConfig.url,
          apiKey: keyToTry,
        });

        return NextResponse.json({
          provider: "cloud",
          contentType: result.contentType,
          image: `data:${result.contentType};base64,${result.image.toString("base64")}`,
        });
      } catch (err) {
        console.warn(`[debug-generate] cloud error with key index ${i}:`, err);
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }
    
    // If all failed
    return NextResponse.json(
      { error: lastErr.message },
      { status: 502 },
    );
  }

  // ── Provider: auto ───────────────────────────────────────────────────────
  if (provider === "auto") {
    let cloudError: string | null = null;

    // Try cloud first
    if (cloudConfig.enabled && cloudConfig.url && cloudConfig.apiKeys && cloudConfig.apiKeys.length > 0) {
      for (let i = 0; i < cloudConfig.apiKeys.length; i++) {
        const keyToTry = cloudConfig.apiKeys[i];
        try {
          const result = await generateWithCloud({
            prompt: positivePrompt,
            model: cloudConfig.model,
            url: cloudConfig.url,
            apiKey: keyToTry,
          });

          return NextResponse.json({
            provider: "cloud",
            contentType: result.contentType,
            image: `data:${result.contentType};base64,${result.image.toString("base64")}`,
          });
        } catch (err) {
          cloudError = err instanceof Error ? err.message : String(err);
          console.warn(`[debug-generate] cloud error with key index ${i}:`, err);
        }
      }
    }

    // Fallback to ComfyUI
    if (!comfyConfig.enabled) {
      const detail = cloudError ? ` (cloud error: ${cloudError})` : "";
      return NextResponse.json(
        { error: `No image generation provider available.${detail}` },
        { status: 405 },
      );
    }

    // Continue to ComfyUI generation below (same as provider=comfyui)
  }

  // ── Provider: comfyui (or auto fallback) ────────────────────────────────
  if (!comfyConfig.enabled) {
    return NextResponse.json(
      { error: "ComfyUI is not enabled. Enable it in Settings first." },
      { status: 405 },
    );
  }

  try {
    const result = await generateWithComfyUI(
      {
        prompt: positivePrompt,
        negativePrompt,
        characterId: "settings-debug",
        useFaceSwap: false,
        avatarPath: null,
      },
      {
        config: {
          ...comfyConfig,
          workflowPath: DEBUG_COMFYUI_WORKFLOW_PATH,
          outputPath: DEFAULT_COMFYUI_OUTPUT_PATH,
          checkpoint: (checkpoint || comfyConfig.checkpoint) ?? DEFAULT_COMFYUI_CHECKPOINT,
        },
      },
    );

    return NextResponse.json({
      provider: "comfyui",
      promptId: result.promptId,
      contentType: result.contentType,
      image: `data:${result.contentType};base64,${result.image.toString("base64")}`,
    });
  } catch (err) {
    console.error("[debug-generate] ComfyUI error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
