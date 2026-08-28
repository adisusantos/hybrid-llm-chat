import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSamplerPreset,
  listSamplerPresets,
} from "@/lib/db/queries";

export async function GET() {
  const rows = await listSamplerPresets();
  return NextResponse.json({
    presets: rows.map((r) => ({
      ...r,
      config: safeParse(r.configJson),
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["global", "character", "chat"]).default("global"),
  config: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
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
  const id = await createSamplerPreset({
    name: parsed.data.name,
    scope: parsed.data.scope,
    configJson: JSON.stringify(parsed.data.config),
  });
  return NextResponse.json({ id });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
