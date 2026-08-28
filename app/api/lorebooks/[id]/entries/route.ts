import { NextResponse } from "next/server";
import { z } from "zod";
import { createLorebookEntry, getLorebook, listLorebookEntries } from "@/lib/db/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lb = await getLorebook(id);
  if (!lb) return NextResponse.json({ error: "lorebook not found" }, { status: 404 });
  const entries = await listLorebookEntries(id);
  return NextResponse.json({ entries });
}

const KeysSchema = z.array(z.string()).default([]);
const PositionSchema = z.enum([
  "before_char",
  "after_char",
  "before_system",
  "after_system",
  "before_exmpls",
]);

const CreateSchema = z.object({
  keys: KeysSchema,
  secondaryKeys: KeysSchema.optional(),
  content: z.string().min(1),
  comment: z.string().optional(),
  insertionOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  regex: z.boolean().optional(),
  constant: z.boolean().optional(),
  position: PositionSchema.optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  selectiveLogic: z.enum(["and", "not"]).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lb = await getLorebook(id);
  if (!lb) return NextResponse.json({ error: "lorebook not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const entryId = await createLorebookEntry(id, parsed.data);
  return NextResponse.json({ id: entryId });
}
