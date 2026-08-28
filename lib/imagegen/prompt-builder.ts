// Client-safe prompt building. The LLM-extracted variant lives in
// `llm-prompt.ts` (server-only) and must not be imported from client code.

/**
 * Flatten a structured avatar analysis JSON string into a compact
 * comma-separated string suitable for Stable Diffusion prompts.
 * If the input is not valid JSON (legacy comma-string format), returns as-is.
 * This is intentionally duplicated from analyze-avatar.ts because this file
 * must remain client-safe (no server-only imports).
 */
function flattenAnalysisToString(raw: string): string {
  if (!raw.trim().startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.values(parsed)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .join(", ");
  } catch {
    return raw;
  }
}

type CharacterGender = "male" | "female" | null;

function readAnalysisField(raw: string | undefined, field: string): string {
  if (!raw?.trim().startsWith("{")) return "";
  try {
    const value = (JSON.parse(raw) as Record<string, unknown>)[field];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function inferGender(text: string): CharacterGender {
  if (/\b(male|man|boy|gentleman|father|dad|son|brother|he|him|his)\b/i.test(text)) return "male";
  if (/\b(female|woman|girl|lady|mother|mom|daughter|sister|she|her|hers)\b/i.test(text)) return "female";
  return null;
}

function resolveGender(
  explicitGender: CharacterGender,
  faceDescription: string | undefined,
  appearance: string,
): CharacterGender {
  if (explicitGender) return explicitGender;
  const analyzed = readAnalysisField(faceDescription, "gender").toLowerCase();
  if (analyzed === "male" || analyzed === "female") return analyzed;
  return inferGender(appearance) ?? inferGender(flattenAnalysisToString(faceDescription ?? ""));
}

function isChildDescription(text: string): boolean {
  const range = text.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?\s*old|year-old)?\b/i);
  if (range && Math.max(Number(range[1]), Number(range[2])) < 13) return true;
  const age = text.match(/\b(\d{1,2})\s*-?\s*(?:years?\s*old|year-old)\b/i);
  return (!!age && Number(age[1]) < 13) || /\bpre[- ]?teen\b|\bchild\b|\bkid\b/i.test(text);
}

function extractAgeDescriptor(text: string): string {
  const numeric = text.match(
    /\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\s*-?\s*(?:years?\s*old|year-old)\b|\b\d{1,2}\s*-?\s*(?:years?\s*old|year-old)\b/i,
  );
  if (numeric) return numeric[0].replace(/\s+/g, " ").trim();
  const preteen = text.match(/\bpre[- ]?teen\b/i);
  if (preteen) return "preteen";
  const category = text.match(/\b(?:early|mid|late) teens?\b|\b(?:young|teenage|adult|middle-aged|elderly)\b/i);
  return category?.[0] ?? "";
}

function flattenBodyAnalysis(raw: string | undefined, child: boolean): string {
  if (!raw) return "";
  if (!child || !raw.trim().startsWith("{")) return flattenAnalysisToString(raw).trim();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const build = parsed.body_build;
    return typeof build === "string" ? build.trim() : "";
  } catch {
    return flattenAnalysisToString(raw).trim();
  }
}

export type PromptFields = {
  // Head/face attributes from the avatar (vision model). Highest priority.
  face: string;
  subject: string;
  outfit: string;
  pose: string;
  environment: string;
  cameraAngle: string;
  shotType: string;
  lens: string;
  lighting: string;
  style: string;
  negativePrompt: string;
};

/**
 * Truncate a string to maxLen characters, always cutting at a word boundary
 * so the result never ends mid-word. Safe to use for SD prompt fields.
 */
function truncateAtWord(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

/** Sensible defaults for fields the chat messages don't cover. */
export const PROMPT_DEFAULTS = {
  cameraAngle: "eye level",
  shotType: "full body shot",
  lens: "85mm",
  lighting: "natural light",
  style: "photorealistic, cinematic",
  negativePrompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
};

// ---------------------------------------------------------------------------
// Age injection
// ---------------------------------------------------------------------------

/**
 * Detect an age-range phrase and prepend the corresponding SD-friendly
 * age-category tag if it isn't already present.
 *   "early 50s, oval face"      → "middle-aged woman, early 50s, oval face"
 *   "early 60s, gray hair"      → "elderly woman, early 60s, gray hair"
 *   "late 20s, dark hair"       → "young woman, late 20s, dark hair"
 *   "elderly woman, 60s, ..."   → unchanged (already tagged)
 */
function injectAgeCategory(desc: string, gender: CharacterGender = null): string {
  const AGE_CATS = /\b(elderly (?:man|woman|person)|middle-aged (?:man|woman|person)|young (?:man|woman)|teenage (?:boy|girl|person)|adult (?:man|woman|person)|preteen (?:boy|girl|child)|boy|girl|child)\b/i;

  // If desc already has an age-category tag, move it to the front if it isn't already there
  const hasExplicitChildAge = /\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\s*-?\s*(?:years?\s*old|year-old)\b|\b\d{1,2}\s*-?\s*(?:years?\s*old|year-old)\b/i.test(desc);
  const existingMatch = desc.match(AGE_CATS);
  if (existingMatch && !hasExplicitChildAge) {
    const rawTag = existingMatch[0].toLowerCase();
    // If tag is bare "middle-aged" / "elderly" / "young" without gender, add gender suffix
    const tag = rawTag;
    // Already at the start — nothing to do
    if (desc.toLowerCase().startsWith(tag)) return desc;
    if (desc.toLowerCase().startsWith(rawTag)) return desc;
    // Move it: strip from current position and prepend
    const stripped = desc.replace(AGE_CATS, "").replace(/,\s*,/g, ",").replace(/^,\s*/,"").replace(/,\s*$/,"").trim();
    return `${tag}, ${stripped}`;
  }

  // Detect gender from face/body description keywords
  const detectedGender = gender ?? inferGender(desc);
  const adultNoun = detectedGender === "male" ? "man" : detectedGender === "female" ? "woman" : "person";
  const childNoun = detectedGender === "male" ? "boy" : detectedGender === "female" ? "girl" : "child";

  const childRange = desc.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?\s*old|year-old)?\b/i);
  if (childRange && Math.max(Number(childRange[1]), Number(childRange[2])) < 13) {
    return `${childNoun}, ${desc}`;
  }
  const exactAge = desc.match(/\b(\d{1,2})\s*-?\s*(?:years?\s*old|year-old)\b/i);
  if (exactAge && Number(exactAge[1]) < 13) return `${childNoun}, ${desc}`;
  if (/\bpre[- ]?teen\b/i.test(desc)) return `preteen ${childNoun}, ${desc}`;

  // Match formats: "early 20s", "mid-40s", "late 50s", "20s", "young (20s)", "(20s)"
  const ageMatch = desc.match(
    /\b(early|mid|late|mid-|early-|late-)?\s*(\d{2})s?\b(?:\s+to\s+(?:early|mid|late)?\s*\d{2}s?)?\b|young\s*\((\d{2})s?\)|middle[-.]aged\s*\((\d{2})s?\)/i,
  );
  if (!ageMatch) {
    // Check for category words without numbers: "young", "middle-aged", "elderly"
    if (/\byoung\b/i.test(desc)) return `young ${adultNoun}, ${desc}`;
    if (/\bmiddle[-.]aged\b/i.test(desc)) return `middle-aged ${adultNoun}, ${desc}`;
    if (/\belderly\b/i.test(desc)) return `elderly ${adultNoun}, ${desc}`;
    return desc;
  }

  const qualifier = (ageMatch[1] ?? "").toLowerCase().replace("-", "");
  // Group 2 = standard format, group 3 = "young (20s)", group 4 = "middle-aged (50s)"
  const decadeStr = ageMatch[2] ?? ageMatch[3] ?? ageMatch[4] ?? "0";
  const decade = parseInt(decadeStr, 10);
  const midAge =
    qualifier === "early" ? decade + 2 : qualifier === "late" ? decade + 8 : decade + 5;

  let category: string;
  if (midAge < 20) category = `teenage ${childNoun}`;
  else if (midAge < 30) category = `young ${adultNoun}`;
  else if (midAge < 45) category = `adult ${adultNoun}`;
  else if (midAge < 60) category = `middle-aged ${adultNoun}`;
  else category = `elderly ${adultNoun}`;

  // If the description doesn't already contain a strong numeric "years old" token,
  // inject it to prevent the SD model from ignoring "late 50s" and defaulting to a 30yo face.
  const hasStrongNumericAge = /\b\d{1,2}\s*(?:years?\s*old|year-old|yo)\b/i.test(desc);

  if (!hasStrongNumericAge) {
    return `${category}, ${midAge} years old, ${desc}`;
  }

  return `${category}, ${desc}`;
}

// ---------------------------------------------------------------------------
// Subject builder
// ---------------------------------------------------------------------------

/**
 * Build the subject field for the SD prompt.
 * Priority:
 *   1. faceDescription + bodyDescription (compact, SD-ready, from vision model)
 *   2. appearance (prose fallback, capped at 800 chars)
 *   3. placeholder
 * Always injects an explicit age-category tag.
 */
/**
 * Extract compact body/build info from the prose `appearance` field as a
 * fallback when bodyDescription is not available (e.g. characters created
 *
 * Scans for sentences that mention build, height, figure, or body shape and
 * returns a compact SD-ready summary (≤120 chars).
 *
 * Examples:
 *   "Jia Li has a thin build, with an average bust and wide hips. She stands at 155cm..."
 *   → "thin build, wide hips, 155cm tall"
 *
 *   "Miss Hattie is a plus-size woman, hourglass figure, average height"
 *   → "plus-size build, hourglass figure, average height"
 */
function extractBodyFromAppearance(appearance: string): string {
  if (!appearance.trim()) return "";

  // Keywords that signal a body/build sentence
  const BUILD_NOUNS =
    /\b(slim|slender|thin|lean|lean muscular|athletic|muscular|heavily muscular|stocky|chubby|overweight|obese|plus.size|full.figured|petite|curvy|thick|barrel|average build|thin build|heavy build|fit|toned|tall|short|average height|petite|towering)\b/i;
  const HEIGHT_RE =
    /\b(\d{3}\s*cm|\d+'\d+|\d+\s*feet|\d+\s*ft\b|tall|short|petite|average height|above average height)\b/i;
  const FIGURE_RE =
    /\b(hourglass|pear.shaped|apple.shaped|rectangular|inverted triangle|barrel|hour.glass|figure)\b/i;

  const sentences = appearance.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const bodyParts: string[] = [];

  for (const s of sentences) {
    if (!BUILD_NOUNS.test(s) && !HEIGHT_RE.test(s) && !FIGURE_RE.test(s)) continue;

    // Extract only the relevant descriptors from the sentence — not the whole sentence
    const descriptors: string[] = [];

    // Build/figure
    const buildMatch = s.match(
      /\b(slim|slender|thin|lean|lean muscular|athletic|muscular|heavily muscular|stocky|chubby|overweight|obese|plus.size|full.figured|curvy|thick|barrel|average build|thin build|heavy build|fit|toned)\s*(?:build|frame|figure|body)?\b/gi,
    );
    if (buildMatch) descriptors.push(...buildMatch.map((m) => m.toLowerCase().trim()));

    // Height — cm or feet/inches or adjective
    const heightMatch = s.match(/\b\d{3}\s*cm\b|\b\d+'\d+\b|\b(tall|short|petite|average height|above average height)\b/gi);
    if (heightMatch) descriptors.push(...heightMatch.map((m) => m.toLowerCase().trim()));

    // Width/proportions
    const propMatch = s.match(/\b(wide hips?|very wide hips?|narrow hips?|broad shoulders?|narrow shoulders?|very broad shoulders?|average bust|small bust|medium bust|large bust|very large bust|extremely large bust|full bust|broad muscular chest|large buttocks|very large buttocks|extremely large buttocks|round buttocks|prominent buttocks|hourglass|pear.shaped|barrel|rectangular)\b/gi);
    if (propMatch) descriptors.push(...propMatch.map((m) => m.toLowerCase().trim()));

    if (descriptors.length > 0) {
      // Deduplicate
      for (const d of descriptors) {
        if (!bodyParts.includes(d)) bodyParts.push(d);
      }
    }

    // Stop after first 2 body-describing sentences to keep it compact
    if (bodyParts.length >= 4) break;
  }

  if (bodyParts.length === 0) return "";
  return bodyParts.slice(0, 6).join(", ");
}

function buildSubject(
  appearance: string,
  faceDescription?: string,
  bodyDescription?: string,
  characterGender?: CharacterGender,
): string {
  const face = faceDescription ? flattenAnalysisToString(faceDescription).trim() : undefined;
  const gender = resolveGender(characterGender ?? null, faceDescription, appearance);
  const ageHint = extractAgeDescriptor(`${face ?? ""}, ${appearance}`);
  const child = isChildDescription(`${ageHint}, ${face ?? ""}, ${appearance}`);
  const bodyRaw = flattenBodyAnalysis(bodyDescription, child);
  const body = bodyRaw || undefined;
  const genderHint = gender ? ` ${gender}` : "";

  if (face || body) {
    // If bodyDescription is missing but appearance has build info, extract it
    const bodyFallback = !body ? extractBodyFromAppearance(appearance) : "";
    const combined = [ageHint, face, body || bodyFallback].filter(Boolean).join(", ") + genderHint;
    return injectAgeCategory(combined, gender);
  }

  const app = appearance.trim();
  if (app) return injectAgeCategory(app.slice(0, 800) + genderHint, gender);
  return "(character appearance not set)";
}

/**
 * Build a compact subject tag for use when [appearance: ...] is present.
 * Only includes age-category + body build — omits the long face detail string
 * because the [appearance:] tag already covers pose/outfit/expression, and
 * face swap handles facial likeness separately.
 *
 * Output example: "adult woman, early 40s, slim build, petite, short"
 */
function buildCompactSubject(
  appearance: string,
  faceDescription?: string,
  bodyDescription?: string,
  characterGender?: CharacterGender,
): string {
  const faceRaw = faceDescription ? flattenAnalysisToString(faceDescription).trim() : "";
  const gender = resolveGender(characterGender ?? null, faceDescription, appearance);
  const child = isChildDescription(`${faceRaw}, ${appearance}`);
  const body = flattenBodyAnalysis(bodyDescription, child) || undefined;
  const genderHint = gender ? ` ${gender}` : "";

  // Extract age from faceDescription — flatten JSON first if needed
  const agePart = extractAgeDescriptor(`${faceRaw}, ${appearance}`);

  // Body build — use bodyDescription or extract from appearance prose
  const bodyPart = body || extractBodyFromAppearance(appearance);

  const parts = [agePart, bodyPart].filter(Boolean).join(", ");
  const withGender = parts + genderHint;
  return parts
    ? injectAgeCategory(withGender, gender)
    : injectAgeCategory((appearance.slice(0, 100) + genderHint).trim(), gender);
}

// ---------------------------------------------------------------------------
// Appearance note parser
// Extract outfit + environment from *[appearance: ...]* lines BEFORE stripping.
// ---------------------------------------------------------------------------

const CLOTHING_NOUNS =
  /\b(tank top|t-shirt|tshirt|crop top|button-up|hoodie|sweater|cardigan|jacket|coat|blazer|vest|blouse|shirt|top|dress|gown|skirt|shorts|pants|trousers|jeans|leggings|stockings|tights|socks|lingerie|bra|panties|underwear|bikini|swimsuit|robe|kimono|sarong|uniform|suit|apron|scarf|boots|heels|sandals|shoes|gloves)\b/gi;

const CLOTHING_DESCRIPTOR =
  /^(white|black|red|blue|green|yellow|pink|purple|orange|grey|gray|brown|navy|crimson|silk|satin|cotton|linen|leather|lace|denim|wool|velvet|sheer|floral|striped|plaid|loose|tight|short|long|sleeveless|strapless|skimpy|revealing|tattered|torn|ripped|elegant)$/i;

const ROOM_NOUNS =
  /\b(kitchen|bedroom|living room|dining room|bathroom|hallway|corridor|apartment|office|classroom|library|garden|backyard|yard|park|street|alley|beach|forest|woods|meadow|field|river|lake|pool|bar|pub|tavern|restaurant|cafe|coffee shop|diner|shop|store|market|hospital|church|temple|school|gym|studio|garage|basement|attic|rooftop|balcony|porch|patio|deck|cabin|tent|castle|dungeon|cave|courtyard|lobby)\b/gi;

const FURNITURE_NOUNS = /\b(bed|couch|sofa|desk|counter|table|chair)\b/gi;

const LOCATION_ADJ =
  /^(dim|dimly|dark|bright|warm|cozy|cold|small|large|spacious|cramped|messy|tidy|empty|crowded|quiet|busy|dusty|sunny|moonlit|candlelit)$/i;

/**
 * Extract the raw text of every *[appearance: ...]* note in a message.
 * Returns "" if none found.
 */
function extractImageNoteText(message: string): string {
  // Matches [image: ...] even if it's missing the closing bracket at the end of the string
  const matches = message.match(/\[image:\s*([^\]]+)(?:\]|$)/gi);
  if (!matches) return "";
  return matches
    .map((m) => m.replace(/\[image:\s*/i, "").replace(/\]$/, "").replace(/\*$/, ""))
    .join(", ");
}

/**
 * Extract the raw text of every *[appearance: ...]* note in a message.
 * Returns "" if none found.
 */
function extractAppearanceNoteText(message: string): string {
  // Matches [appearance: ...] even if it's missing the closing bracket at the end of the string
  const matches = message.match(/\[appearance:\s*([^\]]+)(?:\]|$)/gi);
  if (!matches) return "";
  return matches
    .map((m) => m.replace(/\[appearance:\s*/i, "").replace(/\]$/, "").replace(/\*$/, ""))
    .join(", ");
}

// Pose-relevant verbs/phrases that appear in appearance notes
// e.g. "sitting at table", "standing by window", "leaning against wall"
const POSE_PATTERNS_IN_NOTE =
  /\b(sitting|standing|lying|leaning|kneeling|crouching|walking|running|holding|reaching|looking|smiling|laughing|crying|embracing|hugging|reading|writing|cooking|eating|drinking|working|resting|sleeping)\b[^,]*/i;

/**
 * Extract a compact pose phrase from the appearance note.
 * e.g. "[appearance: navy robe, sitting at table, looking at you warmly, dining room]"
 * → "sitting at table, looking at you warmly"
 */
function extractPoseFromNote(appearanceNote: string): string {
  if (!appearanceNote) return "";
  const segments = appearanceNote.split(",").map((s) => s.trim()).filter(Boolean);
  const poseParts: string[] = [];
  for (const seg of segments) {
    CLOTHING_NOUNS.lastIndex = 0;
    ROOM_NOUNS.lastIndex = 0;
    FURNITURE_NOUNS.lastIndex = 0;
    // Skip if the segment is ONLY a clothing item (no pose verb)
    if (CLOTHING_NOUNS.test(seg) && !POSE_PATTERNS_IN_NOTE.test(seg)) {
      CLOTHING_NOUNS.lastIndex = 0;
      continue;
    }
    CLOTHING_NOUNS.lastIndex = 0;
    // Keep if it contains a pose verb (even if it also mentions furniture/room)
    if (POSE_PATTERNS_IN_NOTE.test(seg)) {
      poseParts.push(seg);
    }
  }
  return poseParts.slice(0, 3).join(", ");
}

/**
 * Extract clothing from the appearance note first (most reliable source),
 * then fall back to scanning narrative sentences.
 */
function extractClothingPhrase(sentences: string[], appearanceNote: string): string {
  // 1. Try appearance note — it's the authoritative "what they're wearing now"
  if (appearanceNote) {
    const items: string[] = [];
    CLOTHING_NOUNS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CLOTHING_NOUNS.exec(appearanceNote)) !== null) {
      const noun = m[0].toLowerCase();
      const before = appearanceNote.slice(0, m.index).trim().split(/\s+/);
      const prev = before[before.length - 1] || "";
      const phrase = CLOTHING_DESCRIPTOR.test(prev) ? `${prev.toLowerCase()} ${noun}` : noun;
      if (!items.includes(phrase)) items.push(phrase);
    }
    if (items.length) return items.slice(0, 4).join(", ");
  }

  // 2. Fall back to narrative sentences
  const CLOTHING_PATTERNS: RegExp[] = [
    /\b(wearing|wears|wore|dressed in|clad in)\b/i,
    /\b(shirt|blouse|skirt|dress|jacket|coat|apron|pants|trousers|jeans|shorts|sweater|cardigan|bra|underwear|robe|kimono|hoodie|top)\b/i,
  ];
  for (const s of sentences) {
    if (!CLOTHING_PATTERNS.some((re) => re.test(s))) continue;
    const items: string[] = [];
    CLOTHING_NOUNS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CLOTHING_NOUNS.exec(s)) !== null) {
      const noun = m[0].toLowerCase();
      const before = s.slice(0, m.index).trim().split(/\s+/);
      const prev = before[before.length - 1] || "";
      const phrase = CLOTHING_DESCRIPTOR.test(prev) ? `${prev.toLowerCase()} ${noun}` : noun;
      if (!items.includes(phrase)) items.push(phrase);
    }
    if (items.length) return items.slice(0, 4).join(", ");
  }
  return "";
}

/**
 * Extract environment from appearance note first, then narrative sentences.
 */
function extractEnvironmentPhrase(sentences: string[], appearanceNote: string): string {
  // Helper: find last matching room/furniture noun with optional adj prefix
  function findLastRoom(text: string): string {
    function lastMatch(re: RegExp): RegExpExecArray | null {
      re.lastIndex = 0;
      let last: RegExpExecArray | null = null;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(text)) !== null) last = mm;
      return last;
    }
    const hit = lastMatch(ROOM_NOUNS) ?? lastMatch(FURNITURE_NOUNS);
    if (!hit) return "";
    const idx = hit.index ?? 0;
    const before = text.slice(0, idx).trim().split(/\s+/);
    const prev = before[before.length - 1] || "";
    const noun = hit[0].toLowerCase();
    return LOCATION_ADJ.test(prev) ? `${prev.toLowerCase()} ${noun}` : noun;
  }

  // 1. Appearance note is most reliable
  if (appearanceNote) {
    const fromNote = findLastRoom(appearanceNote);
    if (fromNote) return fromNote;
  }

  // 2. Narrative sentences
  return findLastRoom(sentences.join(". "));
}

// ---------------------------------------------------------------------------
// Action cleaning & pose compression
// ---------------------------------------------------------------------------

/**
 * Strip roleplay markers, appearance notes, and excess whitespace.
 */
function cleanAction(s: string): string {
  return s
    .replace(/\*?\[(?:appearance|image):[^\]]*\]\*?/gi, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compress a prose narrative sentence into a compact SD-style pose tag.
 * Drops possessive pronouns, filler prepositions, subject pronouns,
 * and trailing scene-setting clauses.
 */
function compressPose(sentence: string): string {
  const s = sentence.trim();
  if (!s) return s;

  const compressed = s
    .replace(/\bthrows? (?:her|his|their) arms? around\b/i, "arms around")
    .replace(/\blowers? (?:her|him|them)self into\b/i, "lowering into")
    .replace(/^(?:\w+ forward and )/i, "")
    .replace(/\b(her|his|their|your|my)\b\s+/gi, "")
    .replace(/\b(in a|with a|with an|into a|onto a)\b\s+/gi, "")
    .replace(/^(she|he|they|it)\s+/i, "")
    // Strip character names at start (e.g. "Mrs. Kwan looks up" → "looks up")
    .replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+/g, "")
    // "stepmom" and similar role-names
    .replace(/^(stepmom|stepmother|stepfather|stepdad|mother|father|sister|brother|aunt|uncle)\s+/i, "")
    .replace(/^(sits?|stands?|walks?|looks?|holds?|reaches?|turns?|leans?|bends?)\b/i, (m) => {
      const base = m.replace(/s$/, "");
      const map: Record<string, string> = {
        sit: "sitting", stand: "standing", walk: "walking", look: "looking",
        hold: "holding", reach: "reaching", turn: "turning", lean: "leaning",
        bend: "bending",
      };
      return map[base.toLowerCase()] ?? base + "ing";
    })
    .replace(/\s*,?\s*\b(as |while |because |since |the morning|the evening|the night)\b.*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return truncateAtWord(compressed, 120);
}

// ---------------------------------------------------------------------------
// Sentence utilities
// ---------------------------------------------------------------------------

function splitSentences(message: string): string[] {
  return message
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^\*?\[(?:appearance|image):/i.test(s));
}

const DESCRIPTION_PATTERNS: RegExp[] = [
  /^(she|he|they)\s+(is|was|has|had|appears?|seems?|looks like|looks to be)\b/i,
  /^(the|a|an)\s+\w+\s+(is|was|has|had)\b/i,
  /^(her|his|their|its)\s+(hair|eyes|skin|face|clothes|dress|shirt|jacket|sarong|kerchief|build|frame|figure|complexion|smile|expression|stare|gaze)\b/i,
  /^(wearing|dressed in|clad in|adorned with)\b/i,
  /^(with)\s+(dark|light|pale|white|black|brown|grey|gray|tanned|olive)\s+(skin|hair|eyes)\b/i,
  // Sentences where the grammatical subject is a non-character object
  /^(the cup|the mug|the glass|the door|the light|the room|the table|the phone)\b/i,
];

function isPureDescription(s: string): boolean {
  return DESCRIPTION_PATTERNS.some((re) => re.test(s));
}

const ACTION_VERBS = [
  "looks", "looking", "holds", "holding", "picks", "picking", "picked",
  "walks", "walking", "walked", "runs", "running", "ran",
  "sits", "sitting", "sat", "stands", "standing", "stood",
  "reaches", "reaching", "reached", "turns", "turning", "turned",
  "takes", "taking", "took", "gives", "giving", "gave",
  "pushes", "pushing", "pushed", "pulls", "pulling", "pulled",
  "lifts", "lifting", "lifted", "drops", "dropping", "dropped",
  "throws", "throwing", "threw", "catches", "catching", "caught",
  "places", "placing", "placed", "sets", "setting", "puts", "putting", "put",
  "leans", "leaning", "leaned", "bends", "bending", "bent",
  "smiles", "smiling", "smiled", "laughs", "laughing", "laughed",
  "frowns", "frowning", "frowned", "grins", "grinning", "grinned",
  "glances", "glancing", "glanced", "stares", "staring", "stared",
  "gazes", "gazing", "gazed", "moves", "moving", "moved",
  "approaches", "approaching", "approached", "leaves", "leaving", "left",
  "enters", "entering", "entered", "exits", "exiting", "exited",
  "opens", "opening", "opened", "closes", "closing", "closed",
  "grasps", "grasping", "grasped", "kneels", "kneeling", "knelt",
  "crouches", "crouching", "crouched", "jumps", "jumping", "jumped",
  "points", "pointing", "pointed", "waves", "waving", "waved",
  "nods", "nodding", "nodded", "shakes", "shaking", "shook",
  "hugs", "hugging", "hugged", "embraces", "embracing", "embraced",
  "sighs", "sighing", "sighed", "raises", "raising", "raised",
  "lowers", "lowering", "lowered", "taps", "tapping", "tapped",
  "shrugs", "shrugging", "shrugged", "crosses", "crossing", "crossed",
  "twists", "twisting", "twisted", "studies", "studying", "studied",
  "stretches", "stretching", "stretched", "peers", "peering", "peered",
  "spins", "spinning", "spun", "sways", "swaying", "swayed",
  "stumbles", "stumbling", "stumbled", "crawls", "crawling", "crawled",
  "dances", "dancing", "danced", "whispers", "whispering", "whispered",
  "yawns", "yawning", "rubs", "rubbing", "reclines", "reclining",
  "cuddles", "cuddling", "snuggles", "snuggling",
  "greets", "greeting", "wipes", "wiping", "wiped",
  "searches", "searching", "searched",
];

/**
 * Pick the best pose sentence from the assistant's message.
 * Skips: dialog, pure description, and sentences whose grammatical subject
 * is an inanimate object (cup, door, light, etc.).
 */
export function pickBestPoseSentence(message: string): string {
  if (!message) return "";
  const sentences = message.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return "";
  if (sentences.length === 1) return cleanAction(sentences[0]!);

  type Scored = { s: string; score: number; idx: number };
  const candidates: Scored[] = [];

  for (let idx = 0; idx < sentences.length; idx++) {
    const s = sentences[idx]!;
    if (/^\s*"/.test(s)) continue;          // skip dialog
    if (isPureDescription(s)) continue;     // skip description (incl. inanimate subjects)
    if (/^\*?\[(?:appearance|image):/i.test(s)) continue; // skip appearance notes

    const lower = s.toLowerCase();
    let score = 0;
    for (const v of ACTION_VERBS) {
      if (lower.includes(v)) score += 2;
    }
    if (s.includes("*")) score += 3;
    if (/\b\w+ing\b/.test(s)) score += 1;
    score += idx * 0.05;
    if (s.length < 20) score *= 0.5;
    if (s.length > 250) score *= 0.8;
    if (score > 0) candidates.push({ s, score, idx });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return cleanAction(candidates[0]!.s);
  }

  // Fallback: last non-description sentence
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (!isPureDescription(sentences[i]!)) return cleanAction(sentences[i]!);
  }
  return cleanAction(sentences[0]!);
}

function pickFirstVisualSentence(sentences: string[]): string {
  for (const s of sentences) {
    if (/^\s*"/.test(s)) continue;
    const lower = s.toLowerCase();
    if (ACTION_VERBS.some((v) => lower.includes(v))) return cleanAction(s);
  }
  for (const s of sentences) {
    if (/^\s*"/.test(s)) continue;
    return cleanAction(s);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Smart camera angle / shot type inference
// ---------------------------------------------------------------------------

type CameraRule = { pattern: RegExp; angle: string; shot?: string };

/**
 * Rules are evaluated top-to-bottom; first match wins.
 * Each rule maps a narrative keyword/phrase to a camera angle (and optionally
 * a shot type override).  The patterns are intentionally broad so they fire
 * on typical roleplay prose such as:
 *   "*hides on top of the wardrobe*"
 *   "*she kneels on the floor, looking up at you*"
 *   "*peering down from the rooftop*"
 */
const CAMERA_RULES: CameraRule[] = [
  // ── Subject is HIGH, camera looks UP ──────────────────────────────────
  { pattern: /\b(on top of|atop|on the roof|rooftop|on the ceiling|climb(?:s|ing)|perch(?:ed|ing)|up in the tree|climbs? up the tree|on the balcony above|hanging from|above you|looking down from|leaning over the railing|up on|bersembunyi di\s*atas|di\s*atas\s+(?:lemari|pohon|atap|gedung|meja|rak))\b/i, angle: "low angle" },
  { pattern: /\b(floating|hovering|flying|soaring|levitat(?:es?|ing)|airborne|mid-?air)\b/i, angle: "worm's eye view" },

  // ── Subject is LOW, camera looks DOWN ─────────────────────────────────
  { pattern: /\b(on the floor|on the ground|lying down|lying on|crawl(?:s|ing)|prone|sprawl(?:ed|ing)|flat on|collapsed|fallen|facedown|face down|bersembunyi di\s*bawah|di\s*bawah\s+(?:meja|ranjang|tempat tidur|selimut))\b/i, angle: "high angle" },
  { pattern: /\b(kneel(?:s|ing)|genuflect|on (?:her|his|their) knees|squat(?:s|ting)|crouch(?:es|ing)|ducking|hunker(?:ed|ing)|sitting on the floor|sits? on the ground)\b/i, angle: "high angle" },
  { pattern: /\b(bird'?s?.?eye|from above|looking down at|viewed from above|overhead)\b/i, angle: "bird's eye view" },

  // ── Dramatic / stylistic ──────────────────────────────────────────────
  { pattern: /\b(tilted|canted|disoriented|dizzy|drunk(?:en)?|spinning|unsteady|off.?balance)\b/i, angle: "dutch angle" },
  { pattern: /\b(towers? over|looms?|looming|intimidat(?:es?|ing)|menacing|stands? tall above)\b/i, angle: "low angle" },

  // ── Side / back views ─────────────────────────────────────────────────
  { pattern: /\b(turns? (?:her|his|their) back|back facing|walks? away|walking away|looking away|from behind|rear view)\b/i, angle: "back view" },
  { pattern: /\b(profile|side view|silhouette against|from the side)\b/i, angle: "side view" },
  { pattern: /\b(over.?(?:the)?.?shoulder|peek(?:s|ing) over|looking over (?:her|his|their) shoulder)\b/i, angle: "over-the-shoulder" },

  // ── Close / intimate ──────────────────────────────────────────────────
  { pattern: /\b(whisper(?:s|ing)?|murmur(?:s|ing)?|lean(?:s|ing)? (?:in )?close|inches? from (?:your|her|his|their) face|nose.to.nose|forehead.to.forehead|faces? close|up close)\b/i, angle: "eye level", shot: "close-up" },
  { pattern: /\b(stares? into (?:your|her|his|their) eyes|locks? eyes|gazing into|eye contact|deep into (?:your|her|his) eyes)\b/i, angle: "eye level", shot: "close-up" },
];

/**
 * Infer camera angle from narrative text.
 * Returns the best-matching angle string, or the default "eye level".
 */
export function inferCameraAngle(message: string): string {
  const cleaned = cleanAction(message);
  for (const rule of CAMERA_RULES) {
    if (rule.pattern.test(cleaned)) return rule.angle;
  }
  return PROMPT_DEFAULTS.cameraAngle;
}

/**
 * Infer shot type from narrative text.
 * Only overrides default when a strong signal is present.
 */
export function inferShotType(message: string): string {
  const cleaned = cleanAction(message);
  // Check camera rules that also specify a shot override
  for (const rule of CAMERA_RULES) {
    if (rule.shot && rule.pattern.test(cleaned)) return rule.shot;
  }
  // Additional shot-type-only rules
  if (/\b(close-?up|closeup|macro|detail of (?:her|his|their) (?:face|eyes|lips|hands?))\b/i.test(cleaned)) return "close-up";
  if (/\b(extreme close.?up|ECU)\b/i.test(cleaned)) return "extreme close-up";
  if (/\b(full body|head to toe|from head to toe|standing full)\b/i.test(cleaned)) return "full body shot";
  if (/\b(wide shot|panoram(?:a|ic)|vast|landscape|establishing)\b/i.test(cleaned)) return "establishing shot";
  if (/\b(upper body|waist up|from the waist|bust shot)\b/i.test(cleaned)) return "medium shot";
  if (/\b(cowboy shot|thigh.?up|american shot)\b/i.test(cleaned)) return "cowboy shot";
  return PROMPT_DEFAULTS.shotType;
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

export function buildHeuristicPrompt(input: {
  appearance: string;
  faceDescription?: string;
  bodyDescription?: string;
  characterGender?: "male" | "female" | null;
  lastAssistantMsg: string;
}): PromptFields {
  const subjectBase = buildSubject(input.appearance, input.faceDescription, input.bodyDescription, input.characterGender);
  const imageNote = extractImageNoteText(input.lastAssistantMsg);
  const appearanceNote = extractAppearanceNoteText(input.lastAssistantMsg);
  const visualNote = imageNote || appearanceNote;
  const sentences = splitSentences(input.lastAssistantMsg);
  const firstVisual = pickFirstVisualSentence(sentences) || sentences[0] || input.lastAssistantMsg;
  // Note pose is cleaner and more SD-friendly than prose narration
  const poseFromNote = extractPoseFromNote(visualNote);
  const pose = poseFromNote || compressPose(cleanAction(firstVisual));
  return {
    face: "",
    subject: subjectBase,
    outfit: truncateAtWord(extractClothingPhrase(sentences, visualNote), 160),
    pose: truncateAtWord(pose, 300),
    environment: truncateAtWord(extractEnvironmentPhrase(sentences, visualNote), 160),
    cameraAngle: inferCameraAngle(input.lastAssistantMsg),
    shotType: inferShotType(input.lastAssistantMsg),
    lens: PROMPT_DEFAULTS.lens,
    lighting: PROMPT_DEFAULTS.lighting,
    style: PROMPT_DEFAULTS.style,
    negativePrompt: PROMPT_DEFAULTS.negativePrompt,
  };
}

/**
 * Extract a concise visual summary from a prose AI message when no
 * [appearance: ...] tag is present. Picks the first 3 non-dialog sentences
 * that contain action verbs or visual descriptions, strips roleplay markers,
 * and joins them into a compact comma-separated phrase.
 */
function summariseMessageForPrompt(message: string): string {
  const sentences = message
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const picked: string[] = [];
  for (const s of sentences) {
    if (/^\s*"/.test(s)) continue; // skip dialog
    if (/^\*?\[(?:appearance|image):/i.test(s)) continue; // skip appearance notes
    const clean = cleanAction(s);
    if (!clean) continue;
    const lower = clean.toLowerCase();
    const hasAction = ACTION_VERBS.some((v) => lower.includes(v));
    const hasVisual = isPureDescription(s);
    if (hasAction || hasVisual) {
      picked.push(compressPose(clean));
      if (picked.length >= 3) break;
    }
  }

  if (picked.length > 0) return picked.join(", ");

  // Fallback: first non-dialog sentence, compressed
  for (const s of sentences) {
    if (/^\s*"/.test(s)) continue;
    return compressPose(cleanAction(s));
  }
  return "";
}

export function buildSmartPrompt(input: {
  appearance: string;
  faceDescription?: string;
  bodyDescription?: string;
  characterGender?: "male" | "female" | null;
  lastAssistantMsg: string;
}): PromptFields {
  // ── Priority 1: use [image: ...] or [appearance: ...] tag verbatim as the scene descriptor ──
  // If the AI message contains an [image: ...] or [appearance: ...] tag, use its full content
  // directly as the pose/scene field — no further decomposition needed.
  // [image: ...] takes priority over [appearance: ...].
  // Subject is kept compact (age + build only) because:
  //   - face swap handles facial likeness separately
  //   - the tag already covers outfit/pose/expression/environment
  const imageNote = extractImageNoteText(input.lastAssistantMsg);
  const appearanceNote = extractAppearanceNoteText(input.lastAssistantMsg);
  const explicitNote = imageNote || appearanceNote;

  if (explicitNote) {
    const compactSubject = buildCompactSubject(
      input.appearance,
      input.faceDescription,
      input.bodyDescription,
      input.characterGender,
    );
    return {
      face: "",
      subject: compactSubject,
      outfit: "",        // embedded in note
      pose: truncateAtWord(explicitNote, 400),
      environment: "",   // embedded in note
      cameraAngle: inferCameraAngle(input.lastAssistantMsg),
      shotType: inferShotType(input.lastAssistantMsg),
      lens: PROMPT_DEFAULTS.lens,
      lighting: PROMPT_DEFAULTS.lighting,
      style: PROMPT_DEFAULTS.style,
      negativePrompt: PROMPT_DEFAULTS.negativePrompt,
    };
  }

  // ── Priority 2: no [appearance:] tag → summarise the bubble chat content ──
  const subject = buildSubject(input.appearance, input.faceDescription, input.bodyDescription, input.characterGender);
  const sentences = splitSentences(input.lastAssistantMsg);
  const summary = summariseMessageForPrompt(input.lastAssistantMsg);
  return {
    face: "",
    subject,
    outfit: truncateAtWord(extractClothingPhrase(sentences, ""), 160),
    pose: truncateAtWord(summary, 300),
    environment: truncateAtWord(extractEnvironmentPhrase(sentences, ""), 160),
    cameraAngle: inferCameraAngle(input.lastAssistantMsg),
    shotType: inferShotType(input.lastAssistantMsg),
    lens: PROMPT_DEFAULTS.lens,
    lighting: PROMPT_DEFAULTS.lighting,
    style: PROMPT_DEFAULTS.style,
    negativePrompt: PROMPT_DEFAULTS.negativePrompt,
  };
}

export function fieldsToPrompt(fields: PromptFields): string {
  return [
    fields.face,
    fields.subject,
    fields.outfit,
    fields.pose,
    fields.environment,
    fields.cameraAngle,
    fields.shotType,
    fields.lens,
    fields.lighting,
    fields.style,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}
