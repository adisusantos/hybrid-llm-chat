import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteSamplerPreset,
  getSamplerPreset,
  updateSamplerPreset,
} from "@/lib/db/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await getSamplerPreset(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  let config: unknown = null;
  try {
    config = JSON.parse(row.configJson);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ preset: { ...row, config } });
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  scope: z.enum(["global", "character", "chat"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
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
  if (id === "default-balanced") {
    // Allow updating config (useful for tuning defaults) but not name or scope.
    if (parsed.data.name !== undefined || parsed.data.scope !== undefined) {
      return NextResponse.json(
        { error: "cannot rename or change scope of default preset" },
        { status: 400 },
      );
    }
  }
  await updateSamplerPreset(id, {
    name: parsed.data.name,
    scope: parsed.data.scope,
    configJson: parsed.data.config ? JSON.stringify(parsed.data.config) : undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === "default-balanced") {
    return NextResponse.json(
      { error: "cannot delete the default preset" },
      { status: 400 },
    );
  }
  await deleteSamplerPreset(id);
  return NextResponse.json({ ok: true });
}
