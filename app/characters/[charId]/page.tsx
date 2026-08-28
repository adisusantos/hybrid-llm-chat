import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { characters } from "@/lib/db/schema";
import { CharacterEditor } from "@/components/character/CharacterEditor";
import { TopNav } from "@/components/top-nav";

export const dynamic = "force-dynamic";

export default async function EditCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ charId: string }>;
  searchParams: Promise<{ created?: string; generated?: string }>;
}) {
  const { charId } = await params;
  const { created, generated } = await searchParams;
  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.id, charId))
    .limit(1);
  const char = rows[0];
  if (!char) notFound();

  const initial = {
    id: char.id,
    name: char.name,
    description: char.description,
    personality: char.personality,
    scenario: char.scenario,
    firstMes: char.firstMes,
    mesExample: char.mesExample,
    systemPromptOverride: char.systemPromptOverride ?? "",
    postHistoryInstructions: char.postHistoryInstructions,
    appearance: char.appearance,
    faceDescription: char.faceDescription ?? "",
    bodyDescription: char.bodyDescription ?? "",
    useFaceSwap: char.useFaceSwap ?? false,
  };

  return (
    <>
      <TopNav active="characters" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Edit character</h1>

        {created && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
            ✓ Character &quot;{char.name}&quot; created successfully.{" "}
            <a href="/characters" className="underline">← Back to characters</a>
          </div>
        )}
        {generated && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
            ✨ AI-generated character &quot;{char.name}&quot; — review and edit fields as needed.
          </div>
        )}
        <CharacterEditor mode="edit" initial={initial} />
      </main>
    </>
  );
}