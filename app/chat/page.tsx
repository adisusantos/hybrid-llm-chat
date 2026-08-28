import Link from "next/link";
import { desc, eq, and, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { characters, chats } from "@/lib/db/schema";
import { CharacterAvatar } from "@/components/character/CharacterAvatar";
import { TopNav } from "@/components/top-nav";
import { deleteChatAction } from "@/app/actions/chat";
import { createChat } from "@/lib/db/queries";
import { redirect } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { NewChatDropdown } from "@/components/character/NewChatDropdown";
 
 export const dynamic = "force-dynamic";
 
 async function createChatAction(formData: FormData) {
   "use server";
   const characterId = formData.get("characterId") as string | null;
   if (!characterId) redirect("/chat");
   const id = await createChat({ characterId });
   redirect(`/chat/${id}`);
 }
 
 export default async function ChatListPage() {
   const [chatRows, allCharacters] = await Promise.all([
     db
       .select({
         id: chats.id,
         title: chats.title,
         characterId: chats.characterId,
         characterName: characters.name,
         updatedAt: chats.updatedAt,
       })
       .from(chats)
       .innerJoin(characters, eq(chats.characterId, characters.id))
       .orderBy(desc(chats.updatedAt)),
     db
       .select({ id: characters.id, name: characters.name, avatarPath: characters.avatarPath })
       .from(characters)
       .where(
         and(
           ne(characters.description, ""),
           ne(characters.personality, ""),
           ne(characters.firstMes, "")
         )
       )
       .orderBy(characters.name),
   ]);

   return (
     <>
       <TopNav active="chats" />
       <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
         <div className="flex items-center justify-between gap-2">
           <div>
             <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
             <p className="text-muted-foreground text-sm">
               Local-only roleplay conversations backed by llama-server.
             </p>
           </div>
         </div>

          {/* New chat — dropdown character selector */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Start new chat with:</p>
            {allCharacters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No characters yet.{" "}
                <Link href="/characters/new" className="underline">
                  Create one first.
                </Link>
              </p>
            ) : (
              <NewChatDropdown characters={allCharacters} action={createChatAction} />
            )}
          </div>

          <hr className="border-border" />

        {chatRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <MessageSquare className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No chats yet. Start one with a character above.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {chatRows.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <CharacterAvatar
                    characterId={c.characterId}
                    name={c.characterName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      <Link href={`/chat/${c.id}`} className="hover:underline">
                        {c.title || `Chat with ${c.characterName}`}
                      </Link>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.characterName} · {new Date(c.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <form action={deleteChatAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton
                    loadingText="…"
                    className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
                  >
                    Delete
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
