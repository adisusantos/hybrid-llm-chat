import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { deleteLorebook, getLorebookWithEntries } from "@/lib/db/queries";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { LorebookEditor } from "@/components/lorebook/LorebookEditor";
import { EntryList, type EntryRow } from "@/components/lorebook/EntryList";
import { LorebookAutoGenerate } from "@/components/lorebook/LorebookAutoGenerate";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LorebookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lb = await getLorebookWithEntries(id);
  if (!lb) notFound();

  const entries: EntryRow[] = lb.entries.map((e) => ({
    id: e.id,
    keys: e.keys,
    secondaryKeys: e.secondaryKeys,
    content: e.content,
    comment: e.comment,
    insertionOrder: e.insertionOrder,
    enabled: e.enabled,
    caseSensitive: e.caseSensitive,
    regex: e.regex,
    constant: e.constant,
    position: e.position,
    priority: e.priority,
    selectiveLogic: e.selectiveLogic,
  }));

  async function deleteAction() {
    "use server";
    await deleteLorebook(id);
    revalidatePath("/lorebooks");
    redirect("/lorebooks");
  }

  return (
    <>
      <TopNav active="lorebooks" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/lorebooks"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> Lorebooks
          </Link>
          <form action={deleteAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Delete lorebook"
            >
              <Trash2 className="size-4" />
            </Button>
          </form>
        </div>

        <LorebookEditor
          lorebookId={lb.id}
          initial={{
            name: lb.name,
            description: lb.description,
            scanDepth: lb.scanDepth,
            tokenBudget: lb.tokenBudget,
          }}
        />

        <LorebookAutoGenerate
          lorebookId={lb.id}
        />

        <EntryList lorebookId={lb.id} entries={entries} />
      </main>
    </>
  );
}
