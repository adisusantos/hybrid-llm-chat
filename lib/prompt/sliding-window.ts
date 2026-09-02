import { estimateTokens } from "@/lib/utils/tokens";
import type { ChatMessage } from "@/lib/llama/client";

/**
 * Sliding window for chat history to prevent context overflow.
 *
 * Triggered automatically when the estimated prompt size (system + history)
 * approaches the llama-server context window. The window trims the oldest
 * messages first, always keeping:
 *   - the system message at index 0
 *   - the most recent N messages (controlled by `minMessages`)
 *   - at minimum, the latest user + assistant turn
 *
 * Old messages are NOT deleted from the database — they remain in chat history
 * and are still loaded for memory extraction, lorebook scanning, etc. They are
 * only excluded from the prompt sent to the LLM.
 *
 * Configuration via env vars (optional):
 *   - LLAMAROLE_MAX_PROMPT_TOKENS: target prompt size cap (default 8000)
 *     Should be set well below llama-server's -c value to leave room for
 *     the response AND to avoid KV cache pressure.
 *     With -c 16384: keep max 8000 tokens → ~8k left for output + safety margin.
 *   - LLAMAROLE_MIN_MESSAGES: always keep at least this many recent messages
 *     (default 6 = 3 user/assistant turns), even if it means going over budget.
 *     Set to 0 to allow truncation to a single message.
 *
 * Aggressive trim: when trimming is needed, we target TRIM_TARGET_RATIO of
 * the cap (default 65%) rather than the cap itself. This keeps the prompt
 * smaller for longer, reducing KV recompute frequency and improving speed.
 *
 * The existing memory system (summary + key memories) is the recommended way to
 * preserve long-term context that gets trimmed by the sliding window — when
 * the user clicks "Summarize now", the summary and memories get injected into
 * the system prompt, so trimmed messages are not permanently lost.
 */

// Default max prompt tokens: 6000 tokens.
// Safe for 8192 context models (leaves ~2200 tokens for output generation + token estimate margins)
// and handles higher context models gracefully.
const DEFAULT_MAX_PROMPT_TOKENS = 6000;
const DEFAULT_MIN_MESSAGES = 6;
const ROLE_OVERHEAD_TOKENS = 4;
// When trimming is triggered, aim for this fraction of the cap instead of the
// cap itself. Lower = fewer re-trims but more context dropped each time.
const TRIM_TARGET_RATIO = 0.65;

function resolveMaxPromptTokens(): number {
  const raw = process.env.LLAMAROLE_MAX_PROMPT_TOKENS;
  if (!raw) return DEFAULT_MAX_PROMPT_TOKENS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_PROMPT_TOKENS;
  return n;
}

function resolveMinMessages(): number {
  const raw = process.env.LLAMAROLE_MIN_MESSAGES;
  if (!raw) return DEFAULT_MIN_MESSAGES;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MIN_MESSAGES;
  return n;
}

export type SlidingWindowResult = {
  messages: ChatMessage[];
  truncated: boolean;
  droppedCount: number;
  totalTokens: number;
  maxPromptTokens: number;
};

/**
 * If the total estimated token count of (system + messages) exceeds the cap,
 * trim the oldest non-system messages until under cap. The system message
 * (index 0) is always preserved. Always keeps the most recent `minMessages`
 * messages regardless of cap.
 *
 * Returns the (possibly trimmed) messages array plus metadata about what was
 * dropped. The caller can use `truncated` to show a UI notice.
 */
export function applySlidingWindow(
  messages: ChatMessage[],
  opts?: { maxPromptTokens?: number; minMessages?: number },
): SlidingWindowResult {
  const maxPromptTokens = opts?.maxPromptTokens ?? resolveMaxPromptTokens();
  const minMessages = opts?.minMessages ?? resolveMinMessages();

  // Index 0 is always the system message — never trim it.
  if (messages.length === 0) {
    return { messages, truncated: false, droppedCount: 0, totalTokens: 0, maxPromptTokens };
  }

  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + ROLE_OVERHEAD_TOKENS,
    0,
  );

  if (totalTokens <= maxPromptTokens) {
    return {
      messages,
      truncated: false,
      droppedCount: 0,
      totalTokens,
      maxPromptTokens,
    };
  }

  // We need to trim. Start from the front (oldest), keeping the system msg
  // at index 0 and at least `minMessages` from the end.
  // Use an aggressive target (TRIM_TARGET_RATIO * cap) so the prompt stays
  // well under the limit for several turns, reducing KV recompute frequency.
  const systemMsg = messages[0]!;
  const history = messages.slice(1);
  const minKeep = Math.min(minMessages, history.length);
  const trimTarget = Math.floor(maxPromptTokens * TRIM_TARGET_RATIO);

  let keepFromEnd = history.length;
  let runningTokens = estimateTokens(systemMsg.content) + ROLE_OVERHEAD_TOKENS;

  for (let i = history.length - 1; i >= 0; i--) {
    if (history.length - i > minKeep && runningTokens >= trimTarget) break;
    const m = history[i]!;
    runningTokens += estimateTokens(m.content) + ROLE_OVERHEAD_TOKENS;
    keepFromEnd = history.length - i;
  }

  // Keep at least minKeep messages even if we can't satisfy the token cap.
  keepFromEnd = Math.max(keepFromEnd, minKeep);

  const trimmedHistory = history.slice(history.length - keepFromEnd);
  const newMessages = [systemMsg, ...trimmedHistory];
  const droppedCount = history.length - trimmedHistory.length;
  const newTotal = newMessages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + ROLE_OVERHEAD_TOKENS,
    0,
  );

  console.log(
    `[sliding-window] trimmed chat history: ${messages.length} -> ${newMessages.length} messages ` +
      `(${totalTokens} -> ${newTotal} tokens, cap=${maxPromptTokens}, dropped=${droppedCount})`,
  );

  return {
    messages: newMessages,
    truncated: droppedCount > 0,
    droppedCount,
    totalTokens: newTotal,
    maxPromptTokens,
  };
}
