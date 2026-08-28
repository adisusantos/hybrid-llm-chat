import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import { testConnection, DEFAULT_COMFYUI_URL } from "@/lib/imagegen/comfyui";

export async function GET() {
  const storedUrl = await getSetting<string>("comfyui.url");
  const url = storedUrl ?? DEFAULT_COMFYUI_URL;

  try {
    const { version } = await testConnection(url);
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error });
  }
}
