import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSamplerPreset,
  setChatSamplerPreset,
} from "@/lib/db/queries";

const PatchSchema = z.object({
  presetId: z.string().nullable(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  // If a preset id is supplied, validate it exists.
  if (parsed.data.presetId !== null) {
    const preset = await getSamplerPreset(parsed.data.presetId);
    if (!preset) {
      return NextResponse.json({ error: "preset not found" }, { status: 404 });
    }
  }
  await setChatSamplerPreset(id, parsed.data.presetId);
  return NextResponse.json({ ok: true });
}
