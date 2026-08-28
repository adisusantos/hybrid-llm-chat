import { NextResponse } from "next/server";
import { z } from "zod";
import { createChat as dbCreateChat } from "@/lib/db/queries";

const Schema = z.object({ characterId: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const id = await dbCreateChat({ characterId: parsed.data.characterId });
  return NextResponse.json({ id });
}
