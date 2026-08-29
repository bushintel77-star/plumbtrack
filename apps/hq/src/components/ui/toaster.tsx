"use client"

import { CheckCircle2, Info, Loader2, OctagonX, TriangleAlert } from "lucide-react"
import { Toaster as Sonner } from "sonner"

import { useBoardStore } from "@/stores/boardStore"

/* Watermelon toast pattern: Sonner themed entirely through the FieldLoop
   tokens — glass panel, etched border, chassis radius. The board theme
   drives Sonner's light/dark shell so toasts follow the active colourway. */

export function Toaster() {
  const theme = useBoardStore(s => s.theme)
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />
      }}
      style={
        {
          "--normal-bg": "var(--panel-strong)",
          "--normal-text": "var(--app-text)",
          "--normal-border": "var(--divider-etch)",
          "--border-radius": "var(--radius)"
        } as React.CSSProperties
      }
    />
  )
}
