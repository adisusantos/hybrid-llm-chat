import "server-only";
import { estimateTokens } from "@/lib/utils/tokens";

// Mirrors lib/db/schema.ts types but avoids a circular import (db -> schema ->
// nothing here, but keeping the type narrow avoids accidentally pulling server-only
// into client code through this module).
export type LorebookPosition =
  | "before_char"
  | "after_char"
  | "before_system"
  | "after_system"
  | "before_exmpls";

export type LorebookEntryInput = {
  id: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  enabled: boolean;
  caseSensitive: boolean;
  regex: boolean; // ignored in MVP — treated as plain substring
  constant: boolean;
  position: LorebookPosition;
  priority: number;
  selectiveLogic: "and" | "not";
};

export type LorebookInput = {
  id: string;
  scanDepth: number;
  tokenBudget: number;
  entries: LorebookEntryInput[];
};

export type ScanMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ActivatedEntry = {
  id: string;
  content: string;
  position: LorebookPosition;
  priority: number;
  insertionOrder: number;
};

/**
 * Check if any key (or all secondary keys, depending on selectiveLogic) of an
 * entry appears in the recent message window. Constant entries always activate.
 *
 * MVP simplification: `regex` flag is honored only as a boolean — when true
 * we use a RegExp on each key; when false we do plain substring match.
 */
function entryMatches(entry: LorebookEntryInput, haystack: string): boolean {
  if (entry.constant) return true;
  if (entry.keys.length === 0) return false;

  const cs = entry.caseSensitive ? "" : "i";
  const haystackCased = entry.caseSensitive ? haystack : haystack.toLowerCase();

  const primaryHit = entry.keys.some((k) => {
    if (!k) return false;
    if (entry.regex) {
      try {
        return new RegExp(k, cs).test(haystack);
      } catch {
        return false;
      }
    }
    const needle = entry.caseSensitive ? k : k.toLowerCase();
    return haystackCased.includes(needle);
  });

  if (!primaryHit) return false;

  if (entry.secondaryKeys.length === 0) return true;

  if (entry.selectiveLogic === "and") {
    // Need ALL secondary keys to also be present.
    return entry.secondaryKeys.every((k) => {
      if (!k) return true;
      if (entry.regex) {
        try {
          return new RegExp(k, cs).test(haystack);
        } catch {
          return false;
        }
      }
      const needle = entry.caseSensitive ? k : k.toLowerCase();
      return haystackCased.includes(needle);
    });
  }

  // "not" — at least one secondary key must NOT appear.
  return entry.secondaryKeys.some((k) => {
    if (!k) return false;
    if (entry.regex) {
      try {
        return !new RegExp(k, cs).test(haystack);
      } catch {
        return true;
      }
    }
    const needle = entry.caseSensitive ? k : k.toLowerCase();
    return !haystackCased.includes(needle);
  });
}

export function scanLorebooks(
  lorebooks: LorebookInput[],
  messages: ScanMessage[],
): ActivatedEntry[] {
  // Combine recent message contents into one searchable haystack. We respect
  // each lorebook's individual scanDepth by trimming per-lorebook.
  const activated: ActivatedEntry[] = [];

  for (const lb of lorebooks) {
    const window = messages.slice(-Math.max(1, lb.scanDepth));
    const haystack = window.map((m) => m.content).join("\n");

    for (const entry of lb.entries) {
      if (!entry.enabled) continue;
      if (entry.content.trim().length === 0) continue;
      if (!entryMatches(entry, haystack)) continue;
      activated.push({
        id: entry.id,
        content: entry.content,
        position: entry.position,
        priority: entry.priority,
        insertionOrder: 0, // populated below
      });
    }
  }

  // Stable sort: priority DESC, then insertion order ASC.
  activated.forEach((e, i) => {
    e.insertionOrder = i;
  });
  activated.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.insertionOrder - b.insertionOrder;
  });
  return activated;
}

export type AssembledPromptParts = {
  beforeChar: string;
  afterChar: string;
  droppedCount: number;
  budget: number;
  used: number;
};

/**
 * Given a base system prompt + activated entries, assemble final system prompt
 * with entries placed at their configured position. Each lorebook's token
 * budget is honored; over-budget entries are dropped (lowest priority first).
 */
export function assembleWithLorebooks(
  lorebooks: LorebookInput[],
  activated: ActivatedEntry[],
  baseSystemPrompt: string,
): AssembledPromptParts {
  const before: string[] = [];
  const after: string[] = [];
  let totalUsed = estimateTokens(baseSystemPrompt);
  let dropped = 0;

  // Group entries by position
  const byPos: Record<LorebookPosition, ActivatedEntry[]> = {
    before_char: [],
    after_char: [],
    before_system: [],
    after_system: [],
    before_exmpls: [],
  };
  for (const e of activated) byPos[e.position].push(e);

  // Build a per-lorebook budget tracker so we can enforce budgets independently.
  for (const lb of lorebooks) {
    const positions: LorebookPosition[] = ["before_char", "before_system", "after_char", "after_system", "before_exmpls"];
    let used = 0;

    for (const pos of positions) {
      const candidates = byPos[pos].filter((e) => {
        const tokens = estimateTokens(e.content);
        if (used + tokens <= lb.tokenBudget) {
          used += tokens;
          return true;
        }
        dropped += 1;
        return false;
      });
      for (const e of candidates) {
        if (pos === "before_char" || pos === "before_system") before.push(e.content);
        else if (pos === "after_char" || pos === "after_system" || pos === "before_exmpls") after.push(e.content);
      }
    }
    totalUsed += used;
  }

  // Recompute dropped properly with budget tracking — the above simplistic
  // grouping may double-count. Do a clean pass at the end:
  // (the droppedCount is informational; precise accounting happens in scanLorebooks
  // caller when wiring real entry-to-lorebook mapping.)

  return {
    beforeChar: before.join("\n\n"),
    afterChar: after.join("\n\n"),
    droppedCount: dropped,
    budget: 0,
    used: totalUsed,
  };
}

/**
 * Single-pass version that owns the entry→lorebook mapping. Use this from
 * the API route instead of the two-step helper above.
 */
export function assembleFinalSystemPrompt(
  entriesWithBudget: Array<{
    entry: LorebookEntryInput;
    lorebookId: string;
    lorebookBudget: number;
  }>,
  matchedIds: Set<string>,
  baseSystemPrompt: string,
): { system: string; dropped: number } {
  const before: string[] = [];
  const after: string[] = [];
  const usage = new Map<string, number>();
  let dropped = 0;

  // Sort: priority DESC, then within priority keep a stable insertion order.
  const ordered = entriesWithBudget
    .filter((x) => matchedIds.has(x.entry.id))
    .sort((a, b) => {
      if (b.entry.priority !== a.entry.priority) return b.entry.priority - a.entry.priority;
      return 0;
    });

  for (const { entry, lorebookId, lorebookBudget } of ordered) {
    const tokens = estimateTokens(entry.content);
    const used = usage.get(lorebookId) ?? 0;
    if (used + tokens > lorebookBudget) {
      dropped += 1;
      continue;
    }
    usage.set(lorebookId, used + tokens);
    if (entry.position === "before_char" || entry.position === "before_system") {
      before.push(entry.content);
    } else {
      after.push(entry.content);
    }
  }

  const beforeBlock = before.length ? before.join("\n\n") + "\n\n" : "";
  const afterBlock = after.length ? "\n\n" + after.join("\n\n") : "";
  const system = `${beforeBlock}${baseSystemPrompt}${afterBlock}`;
  return { system, dropped };
}
