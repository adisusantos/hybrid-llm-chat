import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteLorebookEntry,
  getLorebookEntry,
  updateLorebookEntry,
} from "@/lib/db/queries";

const KeysSchema = z.array(z.string()).default([]);
const PositionSchema = z.enum([
  "before_char",
  "after_char",
  "before_system",
  "after_system",
  "before_exmpls",
]);

const UpdateSchema = z.object({
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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await ctx.params;
  const entry = await getLorebookEntry(id, entryId);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await updateLorebookEntry(id, entryId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await ctx.params;
  await deleteLorebookEntry(id, entryId);
  return NextResponse.json({ ok: true });
}
