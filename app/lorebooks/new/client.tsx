"use client";

import { useRouter } from "next/navigation";
import { LorebookAutoGenerate } from "@/components/lorebook/LorebookAutoGenerate";

export function NewLorebookPageClient() {
  const router = useRouter();

  return (
    <LorebookAutoGenerate
      onCreated={(id) => {
        router.push(`/lorebooks/${id}`);
        router.refresh();
      }}
    />
  );
}
