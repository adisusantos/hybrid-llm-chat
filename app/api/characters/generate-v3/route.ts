import { generateCharacterDraftV3 } from "@/lib/characters/generate"

export const dynamic = "force-dynamic"

// POST /api/characters/generate-v3 — LAB V3 flow.
// Accepts { description, faceDescription?, bodyDescription? }.
// Both faceDescription and bodyDescription (from full-body avatar analysis)
// are treated as authoritative so the generated persona matches the uploaded avatar.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const description = typeof body?.description === "string" ? body.description : ""
    const faceDescription =
      typeof body?.faceDescription === "string" ? body.faceDescription : undefined
    const bodyDescription =
      typeof body?.bodyDescription === "string" ? body.bodyDescription : undefined
    if (!description.trim()) {
      return Response.json({ error: "Deskripsi tidak boleh kosong." }, { status: 400 })
    }
    const fields = await generateCharacterDraftV3({ description, faceDescription, bodyDescription })
    return Response.json(fields)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isConnectionError = msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("econnrefused") || msg.toLowerCase().includes("llm error")
    const suffix = isConnectionError ? " — pastikan llama-server berjalan." : ""
    return Response.json({ error: msg + suffix }, { status: 502 })
  }
}
