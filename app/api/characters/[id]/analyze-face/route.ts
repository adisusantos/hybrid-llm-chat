import { NextResponse } from "next/server";
import { analyzeAvatarFace } from "@/lib/imagegen/analyze-avatar";

// POST /api/characters/[id]/analyze-face
// Runs the vision model on the character's avatar and returns a compact
// head/face description. Does NOT persist it — the client shows it for review
// and saves via the normal character update flow.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { result: faceDescription, provider } = await analyzeAvatarFace(id);
    return NextResponse.json({ faceDescription, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
