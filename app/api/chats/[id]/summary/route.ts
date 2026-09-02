import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addMemory,
  getChat,
  getChatSummary,
  getChatSummaryWatermark,
  hasMemoryWithContent,
  listMemoriesForChat,
  setChatSummary,
  setChatSummaryWatermark,
} from "@/lib/db/queries";
import {
  formatMemoriesBlock,
  selectMemories,
  summarizeConversation,
} from "@/lib/memory/summarizer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  const [summary, mems] = await Promise.all([getChatSummary(id), listMemoriesForChat(id)]);
  return NextResponse.json({ summary, memories: mems });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await setChatSummary(id, "");
  await setChatSummaryWatermark(id, 0);
  return NextResponse.json({ ok: true });
}

const SummarizeBody = z.object({
  messageLimit: z.number().int().min(4).max(500).optional(),
}).optional();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });

  let body: unknown = undefined;
  // Body is optional; ignore parse errors on empty body.
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  const parsed = SummarizeBody.safeParse(body);
  const messageLimit = parsed.success && parsed.data?.messageLimit ? parsed.data.messageLimit : 40;

  // Fetch previous summary to update it iteratively.
  const previousSummary = await getChatSummary(id);

  // Filter out system messages, then use watermark to only process NEW messages
  // (plus some overlap for continuity).
  const allNonSystem = chat.messages.filter((m) => m.role !== "system");
  const totalMsgCount = allNonSystem.length;

  if (totalMsgCount < 2) {
    return NextResponse.json(
      { error: "need at least 2 messages to summarize" },
      { status: 400 },
    );
  }

  const watermark = await getChatSummaryWatermark(id);
  const OVERLAP = 6; // include last N messages from previous window for context continuity
  const newStart = Math.max(0, watermark - OVERLAP);
  const sourceMessages = allNonSystem.slice(newStart, Math.min(allNonSystem.length, newStart + messageLimit));

  if (sourceMessages.length < 2) {
    return NextResponse.json(
      { error: "need at least 2 new messages to summarize" },
      { status: 400 },
    );
  }

  const turns = sourceMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let result;
  try {
    result = await summarizeConversation(turns, { previousSummary, worldSetting: chat.character.worldSetting });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Guard: if summary is empty AND no memories extracted, something went wrong.
  // Don't overwrite a good summary with empty data.
  if (!result.summary && result.memories.length === 0) {
    return NextResponse.json(
      { error: "model returned empty summary and memories" },
      { status: 502 },
    );
  }

  // Guard: if summary starts with '{', parse failed and we got raw JSON — reject.
  if (result.summary.startsWith("{")) {
    return NextResponse.json(
      { error: "model output was not valid JSON (summary looks like raw JSON envelope)" },
      { status: 502 },
    );
  }

  // Persist: replace chat summary, append extracted memories.
  await setChatSummary(id, result.summary);

  // Update watermark to reflect that we've summarized up to this point.
  await setChatSummaryWatermark(id, totalMsgCount);

  let addedCount = 0;
  let skippedCount = 0;
  for (const m of result.memories) {
    if (!m.content || m.content.trim().length === 0) continue;
    // Dedup: skip if a memory with identical content already exists.
    if (await hasMemoryWithContent(id, m.content)) {
      skippedCount += 1;
      continue;
    }
    await addMemory({ chatId: id, content: m.content, importance: m.importance });
    addedCount += 1;
  }

  return NextResponse.json({
    summary: result.summary,
    summaryLength: result.summary.length,
    memoriesAdded: addedCount,
    memoriesSkipped: skippedCount,
    extracted: result.memories,
    provider: result.provider,
  });
}

// PUT: edit summary text manually.
const PutSchema = z.object({ summary: z.string() });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await setChatSummary(id, parsed.data.summary);
  return NextResponse.json({ ok: true });
}

// Re-export the formatter for callers that want to render a preview.
export { formatMemoriesBlock, selectMemories };
