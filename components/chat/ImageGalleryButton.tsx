"use client";

import { useState } from "react";
import { Images, X, Download, Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type GalleryImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  prompt: string;
  createdAt: string;
  messageId: string;
};

type Props = {
  chatId: string;
  images: GalleryImage[];
};

export function ImageGalleryButton({ images }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (images.length === 0) return null;

  const remove = (id: string) => {
    if (!confirm("Delete this image?")) return;
    startTransition(async () => {
      await fetch(`/api/images/${id}`, { method: "DELETE" });
      router.refresh();
    });
  };

  return (
    <>
      {/* Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        title="View all generated images"
      >
        <Images className="size-4" />
        <span>{images.length}</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold">Generated Images ({images.length})</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {images.map((img) => (
                  <div key={img.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Image */}
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={img.url}
                        alt={img.prompt.slice(0, 80)}
                        className="w-full object-contain"
                        style={{ maxHeight: 300 }}
                      />
                    </a>

                    {/* Info */}
                    <div className="p-2">
                      <div className="text-xs text-muted-foreground mb-2">
                        {img.width}×{img.height} · {new Date(img.createdAt).toLocaleDateString()}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
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
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground">Prompt</summary>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{img.prompt}</p>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
