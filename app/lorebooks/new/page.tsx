import { LorebookEditor } from "@/components/lorebook/LorebookEditor";
import { TopNav } from "@/components/top-nav";
import { NewLorebookPageClient } from "./client";

export const dynamic = "force-dynamic";

export default function NewLorebookPage() {
  return (
    <>
      <TopNav active="lorebooks" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
        <LorebookEditor />
        <NewLorebookPageClient />
      </main>
    </>
  );
}
