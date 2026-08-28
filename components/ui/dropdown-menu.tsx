"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

// Native dropdown — no Base UI, no Radix, no library
// Uses simple useState + click-outside detection

interface DropdownMenuContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}
const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({ open: false, setOpen: () => {} })

function DropdownMenu({ children, modal: _modal }: { children: React.ReactNode; modal?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler)
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler) }
  }, [open])

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

function DropdownMenuTrigger({ children, className, style, disabled, asChild, ...props }: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { open, setOpen } = React.useContext(DropdownMenuContext)
  const handleClick = (e: React.MouseEvent) => { e.stopPropagation(); if (!disabled) setOpen(!open) }
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      onClick: handleClick,
      "aria-expanded": open,
    })
  }
  return (
    <button type="button" className={className} style={style} disabled={disabled} onClick={handleClick} aria-expanded={open} {...props}>
      {children}
    </button>
  )
}

function DropdownMenuContent({ children, className, align = "start", sideOffset: _s, alignOffset: _a, side: _side, ...props }: React.ComponentProps<"div"> & { align?: "start" | "end" | "center"; sideOffset?: number; alignOffset?: number; side?: string }) {
  const { open } = React.useContext(DropdownMenuContext)
  if (!open) return null
  return (
    <div
      data-slot="dropdown-menu-content"
      className={cn(
        "absolute z-50 min-w-32 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
        "animate-in fade-in-0 zoom-in-95",
        align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
        "top-full mt-1",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuPortal({ children }: { children: React.ReactNode }) { return <>{children}</> }
function DropdownMenuGroup({ children, ...props }: React.ComponentProps<"div">) { return <div {...props}>{children}</div> }

function DropdownMenuItem({ className, inset, variant = "default", onClick, children, disabled, ...props }: React.ComponentProps<"button"> & { inset?: boolean; variant?: "default" | "destructive" }) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        inset && "pl-7",
        variant === "destructive" && "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10",
        className
      )}
      onClick={(e) => { onClick?.(e); setOpen(false) }}
      {...props}
    >
      {children}
    </button>
  )
}

function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<"div"> & { inset?: boolean }) {
  return <div className={cn("px-1.5 py-1 text-xs font-medium text-muted-foreground", inset && "pl-7", className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
}

function DropdownMenuSub({ children }: { children: React.ReactNode }) { return <>{children}</> }
function DropdownMenuSubTrigger({ className, inset, children, ...props }: React.ComponentProps<"button"> & { inset?: boolean }) {
  return (
    <button type="button" className={cn("flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none hover:bg-accent", inset && "pl-7", className)} {...props}>
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </button>
  )
}
function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("z-50 min-w-32 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10", className)} {...props} />
}

function DropdownMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentProps<"button"> & { checked?: boolean }) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <button type="button" className={cn("relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pl-7 pr-1.5 text-sm hover:bg-accent", className)} onClick={() => setOpen(false)} {...props}>
      <span className="absolute left-1.5">{checked && <CheckIcon className="size-4" />}</span>
      {children}
    </button>
  )
}

function DropdownMenuRadioGroup({ children, ...props }: React.ComponentProps<"div">) { return <div {...props}>{children}</div> }
function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<"button">) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <button type="button" className={cn("relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pl-7 pr-1.5 text-sm hover:bg-accent", className)} onClick={() => setOpen(false)} {...props}>
      {children}
    </button>
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />
}

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuPortal,
  DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuShortcut,
}
