"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return null
}

function SheetTrigger({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <Button type="button" onClick={onClick} className={className}>
      {children}
    </Button>
  )
}

function SheetClose({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <Button type="button" onClick={onClick} className={className}>
      <XIcon />
    </Button>
  )
}

function SheetPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function SheetOverlay({
  className,
  show,
  ...props
}: { show?: boolean; className?: string } & React.ComponentProps<"div">) {
  if (!show) return null
  return (
    <div
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  open,
  onClose,
  ...props
}: {
  className?: string
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  open?: boolean
  onClose?: () => void
} & React.ComponentProps<"div">) {
  if (!open) return null
  return (
    <SheetPortal>
      <SheetOverlay show={open} onClick={onClose} />
      <div
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg sm:max-w-lg",
          side === "right" && "inset-y-0 right-0 h-full",
          side === "left" && "inset-y-0 left-0 h-full",
          side === "top" && "inset-x-0 top-0",
          side === "bottom" && "inset-x-0 bottom-0 h-auto",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetClose
            className="absolute top-3 right-3"
            onClick={onClose}
            aria-label="Close"
          />
        )}
      </div>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn(
        "text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
