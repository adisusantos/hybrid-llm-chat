import { NextResponse } from "next/server";
import { analyzeAvatarFullBody } from "@/lib/imagegen/analyze-avatar";

// POST /api/characters/[id]/analyze-body
// Runs the vision model on the character's avatar and returns both face and
// body descriptions. Does NOT persist them — the client shows them for review
// and saves via the normal character update flow.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { faceDescription, bodyDescription, provider } = await analyzeAvatarFullBody(id);
    return NextResponse.json({ faceDescription, bodyDescription, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
