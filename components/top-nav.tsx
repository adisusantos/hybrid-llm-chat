import Link from "next/link";
import { db } from "@/lib/db/client";
import { characters } from "@/lib/db/schema";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  active?: "chats" | "characters" | "lorebooks" | "settings" | "home";
};

export async function TopNav({ active }: Props) {
  const counts = await db
    .select({ id: characters.id })
    .from(characters)
    .then((rows) => rows.length);

  const linkClass = (key: string) =>
    `text-sm px-3 py-1.5 rounded-md transition-colors ${
      active === key
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
    }`;

  return (
    <nav className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap"
        // Hide horizontal scrollbar but keep scrollable (mobile pattern).
        style={{ scrollbarWidth: "none" }}
      >
        <Link href="/" className="mr-3 shrink-0 text-sm font-semibold tracking-tight">
          Llamarole
        </Link>
        <Link href="/chat" className={`${linkClass("chats")} shrink-0`}>
          Chats
        </Link>
        <Link href="/characters" className={`${linkClass("characters")} shrink-0`}>
          Characters
          <span className="text-muted-foreground ml-1.5 text-xs">({counts})</span>
        </Link>
        <Link href="/lorebooks" className={`${linkClass("lorebooks")} shrink-0`}>
          Lorebooks
        </Link>
        <Link href="/settings" className={`${linkClass("settings")} shrink-0`}>
          Settings
        </Link>
      </div>
      <div className="shrink-0">
        <ThemeToggle />
      </div>
    </nav>
  );
}
