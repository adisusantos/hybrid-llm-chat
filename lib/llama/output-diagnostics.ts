import "server-only";

export type OutputDiagnostics = {
  incomplete: boolean;
  reasons: string[];
};

/**
 * Strip model "meta-comments" that leak into the roleplay output.
 * Some models add safety warnings, author notes, or out-of-character
 * commentary at the end of a response wrapped in backtick code blocks
 * or as plain lines starting with system-like prefixes.
 *
 * Examples of what gets stripped:
 *   ```This is a dangerous response to the prompt...```
 *   ```Note: This content may be inappropriate...```
 *   [Author note: ...]
 */
export function stripModelMetaComments(content: string, charName?: string): string {
  let cleaned = content;

  // Replace any un-substituted SillyTavern template variables the model may have
  // copied from the example format section of the system prompt.
  if (charName) {
    cleaned = cleaned.replace(/\{\{char\}\}/gi, charName);
  }
  // Always clean {{user}} → "User" and any remaining {{char}} without a name
  cleaned = cleaned.replace(/\{\{user\}\}/gi, "User");
  cleaned = cleaned.replace(/\{\{char\}\}/gi, "");

  // Strip trailing backtick-fenced blocks that contain meta-commentary
  // (model talking about the content rather than roleplaying).
  // Pattern: optional newline, ```, any text, ``` at end of string.
  cleaned = cleaned.replace(/\n?```[\s\S]*?```\s*$/g, "");

  // Strip trailing [Author note: ...] / [Note: ...] / [System note: ...]
  cleaned = cleaned.replace(/\n?\[[^\]]*\b(note|warning|disclaimer|author)\b[^\]]*\]\s*$/gi, "");

  // Strip trailing lines that start with "Note:", "Warning:", "Disclaimer:"
  // followed by meta-commentary (not in-character).
  cleaned = cleaned.replace(/\n?(Note|Warning|Disclaimer|Content warning):[^\n]*$/gi, "");

  return cleaned.trimEnd();
}

function hasOddUnescapedQuotes(text: string) {
  let count = 0;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') count += 1;
  }
  return count % 2 === 1;
}

function hasOddAsterisks(text: string) {
  const matches = text.match(/\*/g);
  return Boolean(matches && matches.length % 2 === 1);
}

export function detectIncompleteAssistantReply(content: string): OutputDiagnostics {
  const trimmed = content.trimEnd();
  const reasons: string[] = [];
  if (!trimmed) return { incomplete: false, reasons };

  if (/__USER__:\s*$/m.test(trimmed) || /__ASSISTANT__:\s*$/m.test(trimmed) || /__SYSTEM__:\s*$/m.test(trimmed)) {
    reasons.push("synthetic-speaker-label");
  }

  if (/\[System note:/i.test(trimmed)) {
    reasons.push("system-note-bleed");
  }

  if (hasOddUnescapedQuotes(trimmed)) {
    reasons.push("unclosed-quote");
  }

  if (hasOddAsterisks(trimmed)) {
    reasons.push("unclosed-action-marker");
  }

  if (/\b(and|or|but|that|than|then|with|without|into|from|for|to|of|in|on|at|a|an|the)\s*$/i.test(trimmed)) {
    reasons.push("ends-with-connector");
  }

  if (/[,;:\-–—]\s*$/.test(trimmed)) {
    reasons.push("ends-with-open-punctuation");
  }

  const lastChar = trimmed.at(-1) ?? "";
  if (lastChar && /[A-Za-z0-9]$/.test(lastChar) && !/[.!?"*)\]]$/.test(trimmed)) {
    reasons.push("missing-terminal-punctuation");
  }

  return { incomplete: reasons.length > 0, reasons };
}
