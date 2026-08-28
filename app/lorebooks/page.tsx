import Link from "next/link";
import { BookText, Plus } from "lucide-react";
import { listLorebooks } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TopNav } from "@/components/top-nav";

export const dynamic = "force-dynamic";

export default async function LorebooksPage() {
  const rows = await listLorebooks();

  return (
    <>
      <TopNav active="lorebooks" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lorebooks</h1>
            <p className="text-muted-foreground text-sm">
              World info entries that activate when keywords appear in recent messages.
            </p>
          </div>
          <Link href="/lorebooks/new">
            <Button className="gap-2" variant="default">
              <Plus className="size-4" /> New lorebook
            </Button>
          </Link>
        </div>

        <Separator />

        {rows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <BookText className="text-muted-foreground size-8" />
              <p className="text-muted-foreground text-sm">
                No lorebooks yet. Create one to start adding world info entries.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((lb) => (
              <li key={lb.id}>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        <Link href={`/lorebooks/${lb.id}`} className="hover:underline">
                          {lb.name}
                        </Link>
                      </CardTitle>
                      <p className="text-muted-foreground truncate text-xs">
                        scan {lb.scanDepth} msg · budget {lb.tokenBudget} tok ·{" "}
                        {lb.description || "no description"}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
