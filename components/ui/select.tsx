"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

// Native <select> — no Base UI

function Select({ children, value, onValueChange, defaultValue, disabled }: {
  children: React.ReactNode
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  disabled?: boolean
}) {
  return (
    <SelectContext.Provider value={{ value, onValueChange, defaultValue, disabled }}>
      {children}
    </SelectContext.Provider>
  )
}

interface SelectContextValue {
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  disabled?: boolean
}
const SelectContext = React.createContext<SelectContextValue>({})

function SelectTrigger({ className, children, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "sm" | "default" }) {
  return (
    <div
      data-slot="select-trigger"
      className={cn(
        "flex w-fit items-center gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap select-none",
        "data-[size=sm]:h-7 data-[size=default]:h-8",
        size === "sm" ? "h-7" : "h-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 text-muted-foreground pointer-events-none ml-auto" />
    </div>
  )
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = React.useContext(SelectContext)
  return <span className="flex-1 text-left">{value ?? placeholder ?? ""}</span>
}

// Wrap native <select> for actual functionality
function SelectNative({ className, children, ...props }: React.ComponentProps<"select">) {
  const { value, onValueChange, defaultValue, disabled } = React.useContext(SelectContext)
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
      {...props}
    >
      {children}
    </select>
  )
}

function SelectContent({ children, className, ...props }: React.ComponentProps<"div"> & { side?: string; sideOffset?: number; align?: string; alignOffset?: number; alignItemWithTrigger?: boolean }) {
  const { value, onValueChange, defaultValue, disabled } = React.useContext(SelectContext)
  // Render as native select directly
  return (
    <select
      className={cn("h-8 w-full rounded-lg border border-input bg-popover text-popover-foreground px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50", className)}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  )
}

function SelectGroup({ children }: { children: React.ReactNode }) { return <>{children}</> }
function SelectLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <optgroup label={typeof children === "string" ? children : ""} className={className} />
}

function SelectItem({ children, value, disabled, className }: { children: React.ReactNode; value: string; disabled?: boolean; className?: string }) {
  return <option value={value} disabled={disabled} className={className}>{children}</option>
}

function SelectSeparator({ className }: { className?: string }) { return null }
function SelectScrollUpButton({ className }: { className?: string }) { return null }
function SelectScrollDownButton({ className }: { className?: string }) { return null }

export {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton,
  SelectNative,
}
