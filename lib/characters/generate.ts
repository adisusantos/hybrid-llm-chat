import {
  getCloudTextConfig,
  callCloudText,
  pingCloudText,
} from "@/lib/cloud-ai/cloud-text";
import "server-only"
import { DEFAULT_SAMPLER } from "@/lib/llama/sampler"
import { streamChat } from "@/lib/llama/client"
import { flattenAnalysisToString } from "@/lib/imagegen/analyze-avatar"

export type CharacterDraft = {
  name: string
  description: string
  personality: string
  appearance: string
  scenario: string
  firstMes: string
  mesExample: string
}


async function executeLlmGeneration(systemPrompt: string, userPrompt: string): Promise<{ raw: string; provider: { source: "cloud" | "local"; model: string } }> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  // Try Cloud Text AI first if enabled & reachable
  const cloudCfg = await getCloudTextConfig();
  if (cloudCfg.enabled && cloudCfg.url && cloudCfg.apiKey && cloudCfg.model) {
    const reachable = await pingCloudText(cloudCfg.url, cloudCfg.apiKey);
    if (reachable) {
      try {
        console.log("[chargen] Using cloud text AI:", cloudCfg.model);
        const raw = await callCloudText(cloudCfg, messages, {
          temperature: 0.9,
          max_tokens: 2500,
        });
        return { raw, provider: { source: "cloud", model: cloudCfg.model } };
      } catch (err) {
        console.warn(
          "[chargen] Cloud Text AI failed, falling back to local model:",
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      console.warn("[chargen] Cloud Text AI unreachable, using local model");
    }
  }

  // Fallback to local streamChat
  console.log("[chargen] Using local llama-server");
  let accumulated = "";
  let llmError: string | null = null;

  try {
    for await (const chunk of streamChat(messages, {
      sampler: { ...DEFAULT_SAMPLER, temperature: 0.9, max_tokens: 1200 },
    })) {
      if (chunk.type === "delta") accumulated += chunk.content;
      else if (chunk.type === "error") {
        llmError = chunk.message;
        break;
      } else if (chunk.type === "done") {
        break;
      }
    }
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
  }

  if (llmError) throw new Error("LLM error: " + llmError.slice(0, 200));
  if (!accumulated.trim()) throw new Error("LLM mengembalikan respons kosong.");

  return { raw: accumulated, provider: { source: "local", model: "llama-server" } };
}

export async function generateCharacterDraft({
  description,
  faceDescription,
}: {
  description: string
  faceDescription?: string
}): Promise<CharacterDraft> {
  const userDescription = description.trim()
  if (!userDescription) throw new Error("Deskripsi tidak boleh kosong.")

  // Build the face reference block if avatar analysis is available.
  // faceDescription may be JSON (new format) — flatten to plain text first
  // so the LLM gets readable descriptors, not raw JSON.
  const faceFlat = faceDescription?.trim()
    ? flattenAnalysisToString(faceDescription.trim())
    : ""
  const faceBlock = faceFlat
    ? `\n\nAVATAR ANALYSIS (authoritative — must not be contradicted):\n"${faceFlat}"\n` +
      `Use this to infer ethnicity, age, and facial features. ` +
      `In the "appearance" field, incorporate these face features AND the body/physical traits from the user description above into a cohesive 4-5 sentence paragraph.`
    : ""

  // Instruct the model to treat the user description as two layers:
  // (a) persona/role hints → drive name, description, personality, scenario, firstMes
  // (b) physical/body hints → drive appearance (combined with face analysis if available)
  const prompt = `You are creating a detailed roleplay character.

USER DESCRIPTION (hints about this character):
"${userDescription}"

${faceBlock ? faceBlock + "\n" : ""}INSTRUCTIONS — fill every field thoroughly:

- "name": Full realistic name fitting the character's apparent ethnicity and role.
- "description": 3-4 sentences. Background, occupation details, life circumstances, what makes them interesting. Reference the user description explicitly.
- "personality": 3-4 sentences. Temperament, communication style, emotional quirks, how they interact with others. Be specific, not generic.
- "appearance": MINIMUM 4-5 sentences. MUST include ALL of the following that are relevant:
    * Body type and build (e.g. stocky, tall, petite, overweight, athletic — use EXACT traits from user description if provided)
    * Height impression
    * Facial features (use avatar analysis if provided, otherwise infer from ethnicity/age)
    * Hair (color, length, style)
    * Skin tone
    * Age and age markers
    * Typical clothing style appropriate to their role/occupation
    * Any distinctive physical traits or mannerisms
    If user description mentions physical traits (e.g. "gemuk dan pendek", "tall", "muscular"), these MUST be reflected clearly in this field.
- "scenario": 2-3 sentences. A specific, vivid scene where the user might first encounter this character. Include location, time of day, and what the character is doing.
- "firstMes": 3-5 sentences. Opening message in character. Mix *narrated actions in asterisks* with "spoken dialogue in quotes". Must reflect their personality and the scenario.
- "mesExample": REQUIRED. Write EXACTLY 2 full exchange examples. Each must have a user line AND a full character response with action + dialogue. Format (\\n between exchanges):\n    {{user}}: [message]\\n{{char}}: *[action]* "[dialogue]" *[action]*\n    {{user}}: [second message]\\n{{char}}: *[action]* "[dialogue]" *[closing action]*\n    Make responses reflect personality — NOT generic friendly replies.

YOU MUST output ONLY a raw JSON object. No prose, no markdown fences, no explanation. Start immediately with { and end with }.

{
  "name": "...",
  "description": "...",
  "personality": "...",
  "appearance": "...",
  "scenario": "...",
  "firstMes": "...",
  "mesExample": "..."
}`

  const systemPrompt =
    "You are a professional roleplay character designer. " +
    "You create richly detailed, consistent characters. " +
    "Output ONLY valid JSON. Start immediately with {. No markdown, no preamble, no commentary."

  const { raw } = await executeLlmGeneration(systemPrompt, prompt)
  const result = parseCharacterJSON(raw)
  return result.fields as CharacterDraft
}

function parseCharacterJSON(raw: string) {
  const fields = {
    name: "",
    description: "",
    personality: "",
    appearance: "",
    scenario: "",
    firstMes: "",
    mesExample: "",
  }

  // Stage 1: Direct JSON parse
  try {
    const parsed = JSON.parse(raw)
    extractFields(parsed, fields)
    return { success: true, method: "direct", fields }
  } catch {}

  // Stage 2: Strip markdown fences and try again
  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)
    extractFields(parsed, fields)
    return { success: true, method: "markdown-strip", fields }
  } catch {}

  // Stage 3: Extract JSON boundaries only (handles preamble like "Here is your character:")
  try {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = raw.slice(start, end + 1)
      const parsed = JSON.parse(jsonStr)
      extractFields(parsed, fields)
      return { success: true, method: "boundary-extract", fields }
    }
  } catch {}

  // Stage 4: Repair common JSON issues then re-parse
  // LLMs sometimes emit trailing backslashes or unclosed strings in
  // firstMes/mesExample. Try stripping those before giving up on JSON.
  try {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = raw
        .slice(start, end + 1)
        // Remove lone trailing backslashes before a quote or end of string value
        .replace(/\\+"/g, '\\"')
        .replace(/\\+(,|\n|\r)/g, "$1")
        // Remove control characters that break JSON string parsing
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      const parsed = JSON.parse(jsonStr)
      extractFields(parsed, fields)
      return { success: true, method: "repair", fields }
    }
  } catch {}

  // Stage 5: Field-by-field regex extraction
  console.log("[parseCharacterJSON] JSON parse failed, trying field extraction")
  const extracted = extractFieldsWithRegex(raw)
  Object.assign(fields, extracted)

  const foundCount = Object.values(fields).filter(
    (v) => v && (typeof v === "string" ? v.trim() : (v as string[]).length > 0),
  ).length
  if (foundCount >= 3) {
    return { success: true, method: "regex-extraction", fields }
  }

  // Stage 6: Last resort — signal failure so the API can return a useful error
  // instead of silently putting garbage in the name field.
  console.warn("[parseCharacterJSON] All parse stages failed. Raw output:", raw.slice(0, 300))
  throw new Error(
    "LLM did not return valid JSON. Try again — the model may need another attempt to produce a clean response.",
  )
}

/**
 * Normalise a value that the LLM may have returned as a string, array of
 * strings, or array of {user,char}/{role,content} objects into a plain string.
 */
function normaliseStringField(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          // {user: "...", char: "..."} or {role: "...", content: "..."}
          const o = item as Record<string, unknown>;
          if (typeof o.user === "string" && typeof o.char === "string") {
            return `{{user}}: ${o.user}\n{{char}}: ${o.char}`;
          }
          if (typeof o.role === "string" && typeof o.content === "string") {
            const role = o.role === "assistant" ? "{{char}}" : "{{user}}";
            return `${role}: ${o.content}`;
          }
          // Fallback: join all string values
          return Object.values(o).filter((x) => typeof x === "string").join(" ");
        }
        return String(item);
      })
      .join("\n");
  }
  return "";
}

/**
 * Extract fields from parsed JSON object
 */
function extractFields(
  parsed: Record<string, unknown>,
  fields: { name: string; description: string; personality: string; appearance: string; scenario: string; firstMes: string; mesExample: string }
) {
  fields.name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  fields.description = normaliseStringField(parsed.description);
  fields.personality = normaliseStringField(parsed.personality);
  fields.appearance = normaliseStringField(parsed.appearance);
  fields.scenario = normaliseStringField(parsed.scenario);
  fields.firstMes = normaliseStringField(parsed.firstMes);
  fields.mesExample = normaliseStringField(parsed.mesExample);
}

/**
 * Extract fields using regex when JSON parse fails
 */
function extractFieldsWithRegex(text: string) {
  const fields = {
    name: "",
    description: "",
    personality: "",
    appearance: "",
    scenario: "",
    firstMes: "",
    mesExample: "",
  }
  
  // Helper to extract field value
  const extract = (fieldName: string): string => {
    // Match: "fieldName": "value" or "fieldName":"value"
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`, "i")
    const match = text.match(pattern)
    return match ? match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : ""
  }
  
  fields.name = extract("name")
  fields.description = extract("description")
  fields.personality = extract("personality")
  fields.appearance = extract("appearance")
  fields.scenario = extract("scenario")
  fields.firstMes = extract("firstMes")
  fields.mesExample = extract("mesExample")
  
  return fields
}


export async function generateCharacterDraftV3({
  description,
  faceDescription,
  bodyDescription,
}: {
  description: string
  faceDescription?: string
  bodyDescription?: string
}): Promise<CharacterDraft> {
  const userDescription = description.trim()
  if (!userDescription) throw new Error("Deskripsi tidak boleh kosong.")

  // V3: Both face and body analysis are authoritative.
  // Flatten JSON format (new) to plain text before injecting into LLM prompt.
  const faceFlat = faceDescription?.trim()
    ? flattenAnalysisToString(faceDescription.trim())
    : ""
  const bodyFlat = bodyDescription?.trim()
    ? flattenAnalysisToString(bodyDescription.trim())
    : ""

  let referenceBlock = ""
  if (faceFlat || bodyFlat) {
    referenceBlock =
      "\nAVATAR ANALYSIS (authoritative — must not be contradicted):\n"
    if (faceFlat) {
      referenceBlock += `FACE: "${faceFlat}"\n`
    }
    if (bodyFlat) {
      referenceBlock += `BODY: "${bodyFlat}"\n`
    }
    referenceBlock +=
      "Use FACE to infer ethnicity, age, and facial features. " +
      "Use BODY for build, proportions, and posture. " +
      "In the \"appearance\" field, combine avatar analysis WITH any physical traits from the user description into a cohesive 4-5 sentence paragraph."
  }

  const prompt = `You are creating a detailed roleplay character.

USER DESCRIPTION (hints about this character):
"${userDescription}"

${referenceBlock ? referenceBlock + "\n" : ""}INSTRUCTIONS — fill every field thoroughly:

- "name": Full realistic name fitting the character's apparent ethnicity and role.
- "description": 3-4 sentences. Background, occupation details, life circumstances, what makes them interesting. Reference the user description explicitly.
- "personality": 3-4 sentences. Temperament, communication style, emotional quirks, how they interact with others. Be specific, not generic.
- "appearance": MINIMUM 4-5 sentences. MUST include ALL of the following that are relevant:
    * Body type and build (use EXACT traits from user description AND body analysis if provided)
    * Height impression
    * Facial features (use face analysis if provided, otherwise infer)
    * Hair (color, length, style)
    * Skin tone
    * Age and age markers
    * Typical clothing style appropriate to their role/occupation
    * Any distinctive physical traits or mannerisms
    If user description mentions physical traits, these MUST be clearly reflected.
- "scenario": 2-3 sentences. A specific, vivid scene where the user might first encounter this character. Include location, time of day, what the character is doing.
- "firstMes": 3-5 sentences. Opening message in character. Mix *narrated actions in asterisks* with "spoken dialogue in quotes". Reflect their personality and scenario.
- "mesExample": REQUIRED. Write EXACTLY 2 full exchange examples. Each must have a user line AND a full character response with action + dialogue. Format (\\n between exchanges):\n    {{user}}: [message]\\n{{char}}: *[action]* "[dialogue]" *[action]*\n    {{user}}: [second message]\\n{{char}}: *[action]* "[dialogue]" *[closing action]*\n    Make responses reflect personality — NOT generic friendly replies.

YOU MUST output ONLY a raw JSON object. No prose, no markdown fences, no explanation. Start immediately with { and end with }.

{
  "name": "...",
  "description": "...",
  "personality": "...",
  "appearance": "...",
  "scenario": "...",
  "firstMes": "...",
  "mesExample": "..."
}`

  const systemPrompt =
    "You are a professional roleplay character designer. " +
    "You create richly detailed, consistent characters. " +
    "Output ONLY valid JSON. Start immediately with {. No markdown, no preamble, no commentary."

  const { raw } = await executeLlmGeneration(systemPrompt, prompt)
  const result = parseCharacterJSON(raw)
  return result.fields as CharacterDraft
}
