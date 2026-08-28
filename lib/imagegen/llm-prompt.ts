import {
  getCloudTextConfig,
  callCloudText,
  pingCloudText,
} from "@/lib/cloud-ai/cloud-text";
import "server-only";
import { AION_RP_MODEL_NAME } from "@/lib/llama/types";
import { extractFirstJsonObject } from "@/lib/markdown/remark-dialog";
import type { PromptFields } from "./prompt-builder";
import { PROMPT_DEFAULTS } from "./prompt-builder";

const LLM_SYSTEM_PROMPT = `You are an image generation prompt extractor. Given a roleplay scene and a character description, output a single JSON object with these 9 fields for a 9-part image prompt:

1. "subject": the character's physical description (height, build, hair, eyes, skin, distinguishing marks). MUST come from the "Character physical description" field below. If empty, write "(unspecified)". Do NOT include clothing or location here.
2. "outfit": the character's clothing in the FINAL STATE of the scene — read the ENTIRE message carefully. The character may change clothes mid-scene; always use what they end up wearing last. Concise phrase, e.g. "white t-shirt and trousers". If no clothing is mentioned at all, write "".
3. "pose": the character's body pose or action in the FINAL STATE of the scene — read the ENTIRE message and identify the most visually significant physical position or action described. This is NOT necessarily from the last sentence; it may be described in the middle of the message. E.g. "sitting at vanity mirror, fixing hair". If unclear, write "natural pose".
4. "environment": the setting or location in the FINAL STATE of the scene, synthesized from the whole message. Concise phrase, e.g. "dim bedroom". If not mentioned, write "".
5. "cameraAngle": one of: eye level, low angle, high angle, bird's eye view, worm's eye view, dutch angle, side view, front view, back view, over-the-shoulder
6. "shotType": one of: extreme long shot, long shot, medium long shot, medium shot, medium close-up, close-up, extreme close-up, full body shot, full shot, cowboy shot, establishing shot
7. "lens": a single lens description, e.g. "85mm", "50mm", "wide angle lens", "telephoto lens"
8. "lighting": e.g. "natural light", "golden hour", "soft light", "studio lighting", "cinematic lighting", "rim light", "low key"
9. "style": one of: realistic, photorealistic, cinematic, anime, manga, oil painting, watercolor, sketch, digital art, 3D render, cyberpunk, black and white

CRITICAL RULES:
- READ THE ENTIRE MESSAGE before filling any field. Scenes evolve — clothing may be removed, location may change, pose may shift. Always reflect the FINAL visual state after reading everything.
- "subject" must ONLY contain facts from the "Character physical description" field. Do NOT invent details not mentioned there.
- "outfit" must reflect what the character is wearing at the END of the scene, after any clothing changes described in the message.
- "pose" should capture the most visually significant physical action described ANYWHERE in the message, not just the opening or closing line.
- "environment" should reflect the final location described across the whole scene.
- For camera/shot/lens/lighting/style: pick the most appropriate option given the scene mood. Defaults: "eye level", "full body shot", "85mm", "natural light", "photorealistic, cinematic".
- Do NOT invent details not present in the source text.
- Output ONLY the JSON object. No markdown fences, no commentary.
- Each field should be short (under 20 words).`;

const LLM_USER_TEMPLATE = (input: {
  appearance: string;
  lastAssistantMsg: string;
}) => `Character physical description:
${input.appearance || "(none provided — describe what is depicted based on the scene)"}

Full assistant message (the entire scene to visualize — read all of it):
${input.lastAssistantMsg}

Return the 9-field JSON only.`;

const FIELD_NAMES: (keyof PromptFields)[] = [
  "subject",
  "outfit",
  "pose",
  "environment",
  "cameraAngle",
  "shotType",
  "lens",
  "lighting",
  "style",
];

function fillDefaults(partial: Partial<PromptFields>): PromptFields {
  return {
    // Face comes from the avatar (injected by the client), not the LLM.
    face: (partial.face ?? "").trim(),
    subject: (partial.subject ?? "").trim() || "(unspecified subject)",
    outfit: (partial.outfit ?? "").trim(),
    pose: (partial.pose ?? "").trim() || "natural pose",
    environment: (partial.environment ?? "").trim(),
    cameraAngle: (partial.cameraAngle ?? "").trim() || PROMPT_DEFAULTS.cameraAngle,
    shotType: (partial.shotType ?? "").trim() || PROMPT_DEFAULTS.shotType,
    lens: (partial.lens ?? "").trim() || PROMPT_DEFAULTS.lens,
    lighting: (partial.lighting ?? "").trim() || PROMPT_DEFAULTS.lighting,
    style: (partial.style ?? "").trim() || PROMPT_DEFAULTS.style,
    negativePrompt: (partial.negativePrompt ?? "").trim() || PROMPT_DEFAULTS.negativePrompt,
  };
}

export async function buildLlmPrompt(
  input: {
    appearance: string;
    lastAssistantMsg: string;
  },
  opts?: { baseUrl?: string },
): Promise<PromptFields> {
  const messages = [
    { role: "system" as const, content: LLM_SYSTEM_PROMPT },
    { role: "user" as const, content: LLM_USER_TEMPLATE(input) },
  ];

  let raw = "";

  // Try Cloud Text AI first if enabled & reachable
  const cloudCfg = await getCloudTextConfig();
  if (cloudCfg.enabled && cloudCfg.url && cloudCfg.apiKey && cloudCfg.model) {
    const reachable = await pingCloudText(cloudCfg.url, cloudCfg.apiKey);
    if (reachable) {
      try {
        console.log("[llm-prompt] Using cloud text AI:", cloudCfg.model);
        raw = await callCloudText(cloudCfg, messages, {
          temperature: 0.1,
          max_tokens: 400,
        });
      } catch (err) {
        console.warn(
          "[llm-prompt] Cloud Text AI failed, falling back to local model:",
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      console.warn("[llm-prompt] Cloud Text AI unreachable, using local model");
    }
  }

  // Fallback to local llama-server
  if (!raw) {
    console.log("[llm-prompt] Using local llama-server");
    const baseUrl =
      opts?.baseUrl ?? process.env.LLAMA_BASE_URL ?? "http://127.0.0.1:8080/v1";

    const body = {
      model: AION_RP_MODEL_NAME,
      messages,
      stream: false,
      temperature: 0.1,
      top_p: 0.9,
      top_k: 40,
      min_p: 0.05,
      max_tokens: 400,
      stop: [
        "</s>",
        "<|im_end|>",
        "<|eot_id|>",
        "\n\n__",
        "__USER__:",
        "__ASSISTANT__:",
      ],
      chat_template_kwargs: { enable_thinking: false },
    };

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `llama-server ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    raw = data.choices?.[0]?.message?.content ?? "";
  }

  const objText = extractFirstJsonObject(raw);
  if (!objText) {
    throw new Error("LLM did not return JSON");
  }
  try {
    const parsed = JSON.parse(objText) as Partial<PromptFields>;
    const filtered: Partial<PromptFields> = {};
    for (const f of FIELD_NAMES) {
      if (typeof parsed[f] === "string") (filtered as Record<string, string>)[f] = parsed[f]!;
    }
    return fillDefaults(filtered);
  } catch (err) {
    throw new Error(`LLM JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
