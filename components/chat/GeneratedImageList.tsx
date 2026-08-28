"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Download, ChevronDown, ChevronRight } from "lucide-react";

export type GeneratedImageData = {
  id: string;
  url: string;
  width: number;
  height: number;
  prompt: string;
  createdAt: string;
  paramsJson?: string | null;
};

type Props = {
  images: GeneratedImageData[];
  canRegenerate?: boolean;
  onChanged?: () => void;
};

export function GeneratedImageList({ images }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());

  if (images.length === 0) return null;

  const toggleImage = (id: string) => {
    setExpandedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const remove = (id: string) => {
    if (!confirm("Delete this image?")) return;
    startTransition(async () => {
      await fetch(`/api/images/${id}`, { method: "DELETE" });
      router.refresh();
    });
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.map((img) => {
        const isExpanded = expandedImages.has(img.id);

        // Parse paramsJson to detect provider and faceSwapApplied
        let params: Record<string, unknown> = {};
        try { params = JSON.parse(img.paramsJson ?? "{}"); } catch { }
        const isComfyUI = params.provider === "comfyui";
        const faceSwapApplied = params.faceSwapApplied === true;

        return (
          <div key={img.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header dengan toggle */}
            <button
              type="button"
              onClick={() => toggleImage(img.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm text-muted-foreground">Generated Image</span>
              {isComfyUI && (
                <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1.5 py-0.5">
                  ComfyUI
                </span>
              )}
              {faceSwapApplied && (
                <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1.5 py-0.5">
                  Face Swap ✨
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {img.width}×{img.height}
              </span>
            </button>

            {/* Konten gambar (collapsed by default) */}
            {isExpanded && (
              <>
                {/* Image — tap to open full size in new tab */}
                <a href={img.url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={img.url}
                    alt={img.prompt.slice(0, 80)}
                    className="w-full object-contain"
                    style={{ maxHeight: 400 }}
                  />
                </a>
                {/* Actions */}
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <a
                    href={img.url}
                    download={`image-${img.id.slice(0, 8)}.png`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Download className="size-3" /> Download
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(img.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    Delete
                  </button>
                </div>
                {/* Prompt */}
                <details className="px-2 pb-2">
                  <summary className="cursor-pointer text-[10px] text-muted-foreground">Prompt</summary>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{img.prompt}</p>
                </details>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
