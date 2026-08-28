import Link from "next/link";
import { TopNav } from "@/components/top-nav";

export default function Home() {
  return (
    <>
      <TopNav active="home" />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Llamarole</h1>
          <p className="text-muted-foreground max-w-md">
            Local AI roleplay chat. Backed by llama-server + a GGUF model on your
            own machine. No data leaves the device.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            href="/chat"
            className="rounded-md border border-border bg-card px-4 py-2 transition-colors hover:bg-accent"
          >
            Open chats
          </Link>
          <Link
            href="/characters"
            className="rounded-md border border-border bg-card px-4 py-2 transition-colors hover:bg-accent"
          >
            Characters
          </Link>
        </div>
        <p className="text-muted-foreground text-xs">
          Local AI roleplay — powered by llama-server + ComfyUI.
        </p>
      </main>
    </>
  );
}
