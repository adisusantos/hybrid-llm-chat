import { NextResponse } from "next/server";
import { z } from "zod";
import { generateLorebookDraft, type LorebookEntryDraft } from "@/lib/lorebook/generate";
import {
  createLorebook,
  createLorebookEntry,
  getLorebook,
  listLorebookEntries,
  deleteLorebook,
  deleteLorebookEntry,
} from "@/lib/db/queries";

const EntrySchema = z.object({
  keys: z.array(z.string()),
  secondaryKeys: z.array(z.string()).optional(),
  content: z.string(),
  comment: z.string().optional(),
  insertionOrder: z.number().optional(),
  enabled: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  regex: z.boolean().optional(),
  constant: z.boolean().optional(),
  position: z.enum(["before_char", "after_char", "before_system", "after_system", "before_exmpls"]).optional(),
  priority: z.number().optional(),
  selectiveLogic: z.enum(["and", "not"]).optional(),
});

const BodySchema = z.object({
  lorebookId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  scanDepth: z.number().optional(),
  tokenBudget: z.number().optional(),
  entries: z.array(EntrySchema),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let createdLorebookId: string | null = null;
  const createdEntryIds: string[] = [];

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { lorebookId, name, description, scanDepth, tokenBudget, entries } = parsed.data;

    if (entries.length === 0) {
      return NextResponse.json({ error: "No entries to save" }, { status: 400 });
    }

    let targetLorebookId = lorebookId;

    // Create lorebook if not exists
    if (!targetLorebookId) {
      if (!name?.trim()) {
        return NextResponse.json({ error: "Lorebook name is required when creating new lorebook" }, { status: 400 });
      }
      
      try {
        createdLorebookId = await createLorebook({
          name: name.trim(),
          description: description?.trim() ?? "",
          scanDepth: scanDepth ?? 5,
          tokenBudget: tokenBudget ?? 1024,
        });
        targetLorebookId = createdLorebookId;
      } catch (err) {
        throw new Error("Failed to create lorebook: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      const existing = await getLorebook(targetLorebookId);
      if (!existing) {
        return NextResponse.json({ error: "lorebook not found" }, { status: 404 });
      }
    }

    // Create entries with rollback on failure
    try {
      for (const entry of entries) {
        const id = await createLorebookEntry(targetLorebookId, {
          keys: entry.keys,
          secondaryKeys: entry.secondaryKeys ?? [],
          content: entry.content,
          comment: entry.comment ?? "",
          insertionOrder: entry.insertionOrder ?? 0,
          enabled: entry.enabled ?? true,
          caseSensitive: entry.caseSensitive ?? false,
          regex: entry.regex ?? false,
          constant: entry.constant ?? false,
          position: entry.position ?? "after_char",
          priority: entry.priority ?? 100,
          selectiveLogic: entry.selectiveLogic ?? "and",
        });
        createdEntryIds.push(id);
      }
    } catch (err) {
      // Rollback: delete all created entries and lorebook if we created it
      for (const entryId of createdEntryIds) {
        try {
          await deleteLorebookEntry(targetLorebookId, entryId);
        } catch {
          // ignore cleanup errors
        }
      }
      if (createdLorebookId) {
        try {
          await deleteLorebook(createdLorebookId);
        } catch {
          // ignore cleanup errors
        }
      }
      throw new Error("Failed to create entries: " + (err instanceof Error ? err.message : String(err)));
    }

    const savedEntries = await listLorebookEntries(targetLorebookId);

    return NextResponse.json({
      lorebookId: targetLorebookId,
      entries: savedEntries,
      createdCount: createdEntryIds.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isConnectionError =
      msg.toLowerCase().includes("fetch") ||
      msg.toLowerCase().includes("econnrefused") ||
      msg.toLowerCase().includes("llm error");
    const suffix = isConnectionError ? " — pastikan llama-server berjalan." : "";
    return NextResponse.json({ error: msg + suffix }, { status: 502 });
  }
}
