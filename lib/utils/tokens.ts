// Rough token estimator for budgeting lorebook entries. The plan calls out
// `gpt-tokenizer` as the long-term target; until that ships we approximate
// with the common 4-characters-per-token heuristic. Overestimates are safe
// for budget enforcement (we just inject slightly less than we could).

const CHARS_PER_TOKEN = 4;

export function estimateTokens(s: string): number {
  if (!s) return 0;
  return Math.max(1, Math.ceil(s.length / CHARS_PER_TOKEN));
}

export function estimateTokensSum(items: string[]): number {
  let total = 0;
  for (const s of items) total += estimateTokens(s);
  return total;
}

export function fitToTokenBudget(
  items: Array<{ content: string; tokens: number }>,
  budget: number,
): Array<{ content: string; tokens: number }> {
  const out: Array<{ content: string; tokens: number }> = [];
  let used = 0;
  for (const item of items) {
    if (used + item.tokens > budget) break;
    out.push(item);
    used += item.tokens;
  }
  return out;
}
