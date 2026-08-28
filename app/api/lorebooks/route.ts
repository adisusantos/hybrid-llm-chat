import { NextResponse } from "next/server";
import { z } from "zod";
import { createLorebook, listLorebooks } from "@/lib/db/queries";

export async function GET() {
  const rows = await listLorebooks();
  return NextResponse.json({ lorebooks: rows });
}

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  scanDepth: z.number().int().min(1).max(50).default(5),
  tokenBudget: z.number().int().min(64).max(16384).default(1024),
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
  const id = await createLorebook(parsed.data);
  return NextResponse.json({ id });
}
