import { NextResponse } from "next/server";
import { z } from "zod";
import { generateLorebookDraft } from "@/lib/lorebook/generate";

const BodySchema = z.object({
  description: z.string().min(1),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { description } = parsed.data;
    const draft = await generateLorebookDraft(description);

    return NextResponse.json(draft);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isConnectionError =
      msg.toLowerCase().includes("fetch") ||
      msg.toLowerCase().includes("econnrefused") ||
      msg.toLowerCase().includes("llm error");
    const suffix = isConnectionError ? " — pastikan llama-server berjalan." : "";
    return NextResponse.json({ error: msg + suffix }, { status: 502 });
  }
}
