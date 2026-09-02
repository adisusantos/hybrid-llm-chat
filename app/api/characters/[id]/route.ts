import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { characters } from "@/lib/db/schema";
import { deleteAvatar } from "@/lib/avatars/storage";

const UpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  worldSetting: z.string().optional(),
  firstMes: z.string().optional(),
  mesExample: z.string().optional(),
  systemPromptOverride: z.string().nullable().optional(),
  postHistoryInstructions: z.string().optional(),
  appearance: z.string().optional(),
  faceDescription: z.string().optional(),
  bodyDescription: z.string().optional(),
  useFaceSwap: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
  if (!row[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ character: row[0] });
}

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
  const d = parsed.data;
  // Build update using typed schema columns so Drizzle correctly maps camelCase
  // field names to their snake_case DB column equivalents.
  const updates: Partial<typeof characters.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (d.name !== undefined) updates.name = d.name;
  if (d.description !== undefined) updates.description = d.description;
  if (d.personality !== undefined) updates.personality = d.personality;
  if (d.scenario !== undefined) updates.scenario = d.scenario;
  if (d.worldSetting !== undefined) updates.worldSetting = d.worldSetting;
  if (d.firstMes !== undefined) updates.firstMes = d.firstMes;
  if (d.mesExample !== undefined) updates.mesExample = d.mesExample;
  if (d.systemPromptOverride !== undefined) updates.systemPromptOverride = d.systemPromptOverride;
  if (d.postHistoryInstructions !== undefined) updates.postHistoryInstructions = d.postHistoryInstructions;
  if (d.appearance !== undefined) updates.appearance = d.appearance;
  if (d.faceDescription !== undefined) updates.faceDescription = d.faceDescription;
  if (d.bodyDescription !== undefined) updates.bodyDescription = d.bodyDescription;
  if (d.useFaceSwap !== undefined) updates.useFaceSwap = d.useFaceSwap;

  await db.update(characters).set(updates).where(eq(characters.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(characters).where(eq(characters.id, id));
  await deleteAvatar(id).catch(() => undefined);
  return NextResponse.json({ ok: true });
}