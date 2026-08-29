"use client"

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function Tree({ children, label = "Tree" }: { children: ReactNode; label?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"] > button') ?? [])
    const current = document.activeElement as HTMLElement | null
    const index = current ? items.indexOf(current) : -1
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const next = event.key === "ArrowDown" ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0)
      items[next]?.focus()
      return
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      ;(event.key === "Home" ? items[0] : items[items.length - 1])?.focus()
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const nextQuery = query + event.key.toLowerCase()
      setQuery(nextQuery)
      if (queryTimer.current) clearTimeout(queryTimer.current)
      queryTimer.current = setTimeout(() => setQuery(""), 700)
      const match = items.find(item => item.textContent?.trim().toLowerCase().startsWith(nextQuery))
      match?.focus()
    }
  }
  return <div ref={rootRef} role="tree" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} className="space-y-0.5">{children}</div>
}

export function TreeItem({
  children,
  label,
  expanded = false,
  onToggle,
  selected = false,
  itemId,
  onSelect
}: {
  children?: ReactNode
  label: string
  expanded?: boolean
  onToggle?: () => void
  selected?: boolean
  itemId?: string
  onSelect?: (itemId: string) => void
}) {
  return <div role="treeitem" aria-expanded={children ? expanded : undefined} aria-selected={selected}>
    <button type="button" onKeyDown={event => { if (event.key === "ArrowRight" && children && !expanded) { event.preventDefault(); onToggle?.() } else if (event.key === "ArrowLeft" && children && expanded) { event.preventDefault(); onToggle?.() } }} onClick={() => { onToggle?.(); if (itemId) onSelect?.(itemId) }} className={cn("flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-fill", selected && "bg-chrome-wash text-ink")}>
      {children ? <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} /> : <span className="w-3.5" />}
      <span className="truncate">{label}</span>
    </button>
    {children && expanded && <div role="group" className="ml-4 border-l border-line pl-1">{children}</div>}
  </div>
}
