import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteLorebook, getLorebookWithEntries, updateLorebook } from "@/lib/db/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await getLorebookWithEntries(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lorebook: row });
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  scanDepth: z.number().int().min(1).max(50).optional(),
  tokenBudget: z.number().int().min(64).max(16384).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
  await updateLorebook(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteLorebook(id);
  return NextResponse.json({ ok: true });
}
