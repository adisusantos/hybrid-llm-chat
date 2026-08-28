"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ open, onOpenChange, ...props }: { open?: boolean; onOpenChange?: (open: boolean) => void } & React.ComponentProps<"div">) {
  return <div data-slot="dialog" {...props} />
}

function DialogTrigger({ children, onClick, ...props }: React.ComponentProps<"button">) {
  return (
    <Button type="button" onClick={onClick} {...props}>
      {children}
    </Button>
  )
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(<>{children}</>, document.body)
}

function DialogClose({ children, onClick, ...props }: React.ComponentProps<"button">) {
  return (
    <Button type="button" onClick={onClick} {...props}>
      {children}
    </Button>
  )
}

function DialogOverlay({
  className,
  show,
  ...props
}: { show?: boolean; className?: string } & React.ComponentProps<"div">) {
  if (!show) return null
  return (
    <div
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  open,
  onClose,
  ...props
}: {
  className?: string
  children: React.ReactNode
  showCloseButton?: boolean
  open?: boolean
  onClose?: () => void
} & React.ComponentProps<"div">) {
  if (!open) return null
  return (
    <DialogPortal>
      <DialogOverlay show={open} onClick={onClose} />
      <div
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 sm:max-w-sm max-h-[calc(100vh-2rem)] flex flex-col",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon />
          </DialogClose>
        )}
      </div>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  onClose,
  ...props
}: {
  className?: string
  showCloseButton?: boolean
  children: React.ReactNode
  onClose?: () => void
} & React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose className="gap-2" onClick={onClose}>
          Close
        </DialogClose>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn(
        "text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
