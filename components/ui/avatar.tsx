import * as React from "react"
import { cn } from "@/lib/utils"

function Avatar({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar"
      className={cn("relative flex shrink-0 overflow-hidden rounded-full", className)}
      style={style}
      {...props}
    />
  )
}

function AvatarImage({ className, src, alt, ...props }: React.ComponentProps<"img">) {
  if (!src) return null
  return (
    <img
      data-slot="avatar-image"
      src={src}
      alt={alt}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-fallback"
      className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-medium", className)}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
