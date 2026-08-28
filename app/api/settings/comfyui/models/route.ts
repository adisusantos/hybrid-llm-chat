import { NextResponse } from "next/server";
import { getComfyUIConfig } from "@/lib/imagegen/comfyui";

// GET /api/settings/comfyui/models
// Fetches the list of installed checkpoint models from ComfyUI via
// GET /object_info/CheckpointLoaderSimple — returns the `ckpt_name` input
// which ComfyUI populates with all available checkpoints on disk.
//
// Returns: { models: string[] }

export async function GET() {
  let config;
  try {
    config = await getComfyUIConfig();
  } catch {
    return NextResponse.json({ error: "Failed to load ComfyUI config" }, { status: 500 });
  }

  const baseUrl = config.url.replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`, {
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `ComfyUI unreachable at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `ComfyUI returned ${res.status}` },
      { status: 502 },
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON from ComfyUI" }, { status: 502 });
  }

  // Response shape:
  // { CheckpointLoaderSimple: { input: { required: { ckpt_name: [string[], {}] } } } }
  try {
    const models =
      (data as Record<string, unknown>)
        ?.CheckpointLoaderSimple
        // @ts-expect-error dynamic shape
        ?.input?.required?.ckpt_name?.[0] as string[] | undefined;

    if (!Array.isArray(models)) {
      return NextResponse.json({ error: "Unexpected response shape from ComfyUI" }, { status: 502 });
    }

    return NextResponse.json({ models: models.sort() });
  } catch {
    return NextResponse.json({ error: "Failed to parse model list" }, { status: 502 });
  }
}
