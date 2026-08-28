import { NextResponse } from "next/server";
import { z } from "zod";
import { importChatBundle } from "@/lib/bundle/import";

const Schema = z
  .object({
    title: z.string().max(120).optional(),
  })
  .optional();

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // The body itself is the bundle. We allow an optional { bundle, title }
  // wrapper for future flexibility, but accept raw bundles too.
  let bundle: unknown = body;
  let title: string | undefined;
  if (body && typeof body === "object" && "bundle" in body) {
    const obj = body as { bundle: unknown; title?: unknown };
    bundle = obj.bundle;
    title = typeof obj.title === "string" ? obj.title : undefined;
  } else {
    const parsed = Schema.safeParse(body);
    if (parsed.success && parsed.data?.title) title = parsed.data.title;
  }

  try {
    const result = await importChatBundle(bundle, { title });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
