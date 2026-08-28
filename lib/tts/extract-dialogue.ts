/**
 * Cleanly extracts spoken dialogue from an AI roleplay response.
 *
 * Steps:
 * 1. Remove image generation tags (`[Image: ...]`, `[image: ...]`) & code blocks.
 * 2. If explicit double quotes (`"..."` or `“...”`) exist, extract text inside double quotes.
 * 3. If no double quotes exist:
 *    - Remove all action blocks wrapped in `*...*`, `_..._`, `(...)`, `[...]`.
 *    - Clean up dialogue tags like `, she replied,`, `, he said,` if any remained.
 *    - Return the remaining text.
 */
export function extractDialogue(text: string): string {
  if (!text || !text.trim()) return "";

  let cleaned = text;

  // 1. Remove [Image: ...] or [image: ...] blocks (multiline or single line)
  cleaned = cleaned.replace(/\[(?:image|Image):[\s\S]*?\]/gi, " ");

  // 2. Remove markdown code blocks & inline code
  cleaned = cleaned.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

  // 3. Check for double-quoted dialogue ("dialogue" or “dialogue”)
  // We strictly use double quotes to avoid apostrophes like don't, I'm, it's, etc.
  const doubleQuoteRegex = /["“]([^"”]+)["”]/g;
  const doubleQuotes: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = doubleQuoteRegex.exec(cleaned)) !== null) {
    const snippet = match[1]?.trim();
    if (snippet && snippet.length > 0) {
      doubleQuotes.push(snippet);
    }
  }

  if (doubleQuotes.length > 0) {
    return doubleQuotes.join(" ");
  }

  // 4. Fallback when NO double quotes are present (e.g. Ling Mei Wong style or unquoted dialogue):
  // Strip actions inside *asterisks*, _underscores_, (parentheses), [brackets]
  cleaned = cleaned
    .replace(/\*{1,3}[^*]*\*{1,3}/g, " ")
    .replace(/_{1,3}[^_]*_{1,3}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");

  // 5. Clean up common dialogue tags left in plain text (e.g., ", she replied," or ", he said,")
  cleaned = cleaned
    .replace(/,\s*(?:she|he|they|I)\s+(?:replied|said|asked|added|muttered|whispered|nodded|smiled)[^.,!?]*[.,!?]/gi, ".")
    .replace(/,\s*(?=[A-Z])/g, ". ")
    .replace(/,\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim();

  // 6. If cleaned text is non-empty, return it
  if (cleaned.length > 0) {
    return cleaned;
  }

  // 7. Ultimate fallback: strip symbols and return raw text
  return text.replace(/[*_~[\]()]/g, "").trim();
}
