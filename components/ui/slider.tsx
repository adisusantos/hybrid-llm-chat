"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function Slider({ className, min = 0, max = 100, step = 1, value, defaultValue, onValueChange, disabled, orientation = "horizontal", ...props }: Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  orientation?: "horizontal" | "vertical"
}) {
  const controlled = value !== undefined
  const initial = (controlled ? value : defaultValue)?.map(Number) ?? [Number(min)]
  const [internal, setInternal] = React.useState<number[]>(initial)
  const current = controlled ? value! : internal

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const newVal = [...current]
    newVal[idx] = Number(e.target.value)
    if (!controlled) setInternal(newVal)
    onValueChange?.(newVal)
  }

  return (
    <div
      data-slot="slider"
      className={cn("relative flex w-full items-center", orientation === "vertical" && "flex-col h-full w-auto", className)}
    >
      {current.map((v, i) => (
        <input
          key={i}
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          disabled={disabled}
          onChange={(e) => handleChange(e, i)}
          className="w-full accent-primary h-1 cursor-pointer disabled:opacity-50"
        />
      ))}
    </div>
  )
}

export { Slider }
