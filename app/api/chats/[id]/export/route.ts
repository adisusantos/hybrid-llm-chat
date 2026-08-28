import { NextResponse } from "next/server";
import { buildChatBundle } from "@/lib/bundle/export";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const bundle = await buildChatBundle(id);
    const charName = bundle.character?.name?.trim() || "chat";
    const ts = new Date(bundle.exportedAt);
    const yyyy = ts.getUTCFullYear();
    const mm = String(ts.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ts.getUTCDate()).padStart(2, "0");
    const filename = `${charName.replace(/[^a-zA-Z0-9-_ ]/g, "_").slice(0, 60)}-${yyyy}${mm}${dd}.json`;
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
