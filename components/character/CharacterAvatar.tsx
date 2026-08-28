"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { colorFor, initialsFor } from "@/lib/utils/avatar-fallback";
import { cn } from "@/lib/utils";

type Props = {
  characterId: string | null | undefined;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Cache-buster: change this (e.g. Date.now()) to force the avatar image to
   *  reload after an upload, since the URL is otherwise identical. */
  version?: string | number;
  /** When true, clicking the avatar opens a full-size preview lightbox.
   *  Disabled automatically when there is no avatar image (e.g. fallback). */
  clickable?: boolean;
  /** Optional caption shown below the preview in the lightbox. Defaults to `name`. */
  previewName?: string;
};

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
};

export function CharacterAvatar({
  characterId,
  name,
  size = "md",
  className,
  version,
  clickable = false,
  previewName,
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const bg = colorFor(name || "?");

  const imageSrc = characterId
    ? `/api/avatars/${characterId}${version != null ? `?v=${version}` : ""}`
    : null;
  // Include the URL in the failure state so a newly uploaded avatar retries
  // automatically when its cache-busting version changes.
  const avatarSrc = imageSrc && failedSrc !== imageSrc ? imageSrc : null;

  // Only the image-bearing avatar is "clickable" — fallback initials have no
  // underlying image to preview, so keep them non-interactive.
  const isClickable = Boolean(clickable && avatarSrc);

  useEffect(() => {
    if (!lightboxOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

  return (
    <>
      <Avatar
        className={cn(
          SIZES[size],
          "overflow-hidden",
          isClickable &&
            "cursor-pointer transition-[box-shadow,transform] duration-150 hover:scale-[1.03] hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none",
          className
        )}
        style={{ background: bg }}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={
          isClickable ? `Open preview of ${name}'s avatar` : undefined
        }
        onClick={
          isClickable
            ? () => setLightboxOpen(true)
            : undefined
        }
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLightboxOpen(true);
                }
              }
            : undefined
        }
      >
        {avatarSrc ? (
          // Plain <img> instead of base-ui <AvatarImage> so SSR includes the tag.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={name}
            onError={() => setFailedSrc(imageSrc)}
            className="aspect-square size-full object-cover"
          />
        ) : (
          <AvatarFallback className="font-semibold text-white">
            {initialsFor(name)}
          </AvatarFallback>
        )}
      </Avatar>

      {/* Lightbox preview — rendered via portal in DialogContent. */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          open={lightboxOpen}
          // Re-use the existing shadcn dialog shell but enlarge it and
          // strip the default background so the image can fill the box.
          className="max-w-3xl items-center justify-items-center gap-3 bg-popover/95 p-4 sm:p-6"
          onClose={() => setLightboxOpen(false)}
        >
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSrc ?? undefined}
              alt={name}
              // Natural size; capped by container so very large renders stay inside the viewport.
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
            />
            <DialogTitle className="text-center text-sm font-medium">
              {previewName ?? name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Press Esc or click outside to close.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
