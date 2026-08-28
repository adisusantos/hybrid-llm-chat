import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { characters, chats } from "@/lib/db/schema";
import { CharacterAvatar } from "@/components/character/CharacterAvatar";
import { TopNav } from "@/components/top-nav";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { SubmitButton } from "@/components/ui/submit-button";
import { createChat } from "@/lib/db/queries";
import { ComfyUIWorkflowDebug } from "@/components/settings/ComfyUIWorkflowDebug";
import { loadComfyUIWorkflowDebug } from "@/lib/imagegen/workflow-debug";
import { DEBUG_COMFYUI_WORKFLOW_PATH } from "@/lib/imagegen/comfyui";

export const dynamic = "force-dynamic";

async function deleteCharacterAction(formData: FormData) {
  "use server";
  const id = formData.get("characterId") as string;
  if (!id) return;
  await db.delete(chats).where(eq(chats.characterId, id));
  await db.delete(characters).where(eq(characters.id, id));
  redirect("/characters");
}

async function newChatAction(formData: FormData) {
  "use server";
  const characterId = formData.get("characterId") as string;
  if (!characterId) redirect("/characters");
  const id = await createChat({ characterId });
  redirect(`/chat/${id}`);
}

async function loadCharacterAvatarWorkflow() {
  "use server";
  return loadComfyUIWorkflowDebug();
}

export default async function CharactersPage() {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      description: characters.description,
    })
    .from(characters)
    .orderBy(desc(characters.updatedAt));

  return (
    <>
      <TopNav active="characters" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
            <p className="text-muted-foreground text-sm">
              Authored and imported personas used to start chats.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/characters/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              <Plus className="size-4" /> New character
            </Link>
          </div>
        </div>

        <ComfyUIWorkflowDebug
          workflowPath={DEBUG_COMFYUI_WORKFLOW_PATH}
          loadAction={loadCharacterAvatarWorkflow}
        />

        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
            No characters yet. Create one or import a V2/V3 JSON card.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
              >
                <div className="flex items-start gap-3">
                  <CharacterAvatar
                    characterId={c.id}
                    name={c.name}
                    size="md"
                    clickable
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {c.name || "(unnamed)"}
                    </div>
                  </div>
                </div>
                {c.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/characters/${c.id}`}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    Edit
                  </Link>
                  <form action={newChatAction}>
                    <input type="hidden" name="characterId" value={c.id} />
                    <SubmitButton
                      loadingText="Starting…"
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-60"
                    >
                      New chat
                    </SubmitButton>
                  </form>
                  <form action={deleteCharacterAction}>
                    <input type="hidden" name="characterId" value={c.id} />
                    <SubmitButton
                      loadingText="…"
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      Delete
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
