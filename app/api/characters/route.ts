import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { characters } from "@/lib/db/schema";

export async function GET() {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      description: characters.description,
      updatedAt: characters.updatedAt,
    })
    .from(characters)
    .orderBy(characters.name);
  return NextResponse.json({ characters: rows });
}

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  firstMes: z.string().default(""),
  mesExample: z.string().default(""),
  systemPromptOverride: z.string().nullable().optional(),
  postHistoryInstructions: z.string().default(""),
  appearance: z.string().default(""),
  faceDescription: z.string().nullable().optional(),
  bodyDescription: z.string().nullable().optional(),
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
  const id = crypto.randomUUID();
  const now = new Date();
  const data = parsed.data;
  await db.insert(characters).values({
    id,
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    firstMes: data.firstMes,
    mesExample: data.mesExample,
    systemPromptOverride: data.systemPromptOverride ?? null,
    postHistoryInstructions: data.postHistoryInstructions,
    appearance: data.appearance,
    faceDescription: data.faceDescription ?? null,
    bodyDescription: data.bodyDescription ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ id });
}

export async function PUT() {
  return NextResponse.json({ error: "use /api/characters/[id]" }, { status: 405 });
}
