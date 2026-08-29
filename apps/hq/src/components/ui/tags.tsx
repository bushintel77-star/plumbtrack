"use client"

/* Kibo UI tags composition, hand-ported onto the FieldLoop primitives
   (Badge / Button / Command / Popover). Multi-select tag picker:
   Tags, TagsTrigger, TagsValue (removable), TagsContent, TagsInput,
   TagsList, TagsEmpty, TagsGroup, TagsItem. */

import { X } from "lucide-react"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEventHandler,
  type ReactNode
} from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type TagsContextType = {
  open: boolean
  onOpenChange: (open: boolean) => void
  width?: number
}

const TagsContext = createContext<TagsContextType>({
  open: false,
  onOpenChange: () => {},
  width: undefined
})

const useTagsContext = () => useContext(TagsContext)

export type TagsProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
  className?: string
}

export const Tags = ({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
  className
}: TagsProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [width, setWidth] = useState<number>()
  const ref = useRef<HTMLDivElement>(null)

  const open = controlledOpen ?? uncontrolledOpen
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const resizeObserver = new ResizeObserver(entries => {
      setWidth(entries[0]?.contentRect.width)
    })
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  return (
    <TagsContext.Provider value={{ open, onOpenChange, width }}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <div className={cn("relative w-full", className)} ref={ref}>
          {children}
        </div>
      </Popover>
    </TagsContext.Provider>
  )
}

export type TagsTriggerProps = ComponentProps<typeof Button>

export const TagsTrigger = ({ className, children, ...props }: TagsTriggerProps) => (
  <PopoverTrigger asChild>
    <Button
      className={cn("h-auto w-full justify-between p-2", className)}
      role="combobox"
      variant="outline"
      {...props}
    >
      <div className="flex flex-wrap items-center gap-1">
        {children}
        <span className="px-2 py-px text-ink-low">Select tags...</span>
      </div>
    </Button>
  </PopoverTrigger>
)

export type TagsValueProps = ComponentProps<typeof Badge> & { onRemove?: () => void }

export const TagsValue = ({ className, children, onRemove, ...props }: TagsValueProps) => {
  const handleRemove: MouseEventHandler<HTMLDivElement> = event => {
    event.preventDefault()
    event.stopPropagation()
    onRemove?.()
  }

  return (
    <Badge className={cn("flex items-center gap-2", className)} {...props}>
      {children}
      {onRemove && (
        // Clickable badge region — keyboard users toggle via the trigger + list.
        <div
          className="size-auto cursor-pointer hover:text-ink-low"
          onClick={handleRemove}
          role="button"
          tabIndex={-1}
          aria-hidden
        >
          <X size={12} />
        </div>
      )}
    </Badge>
  )
}

export type TagsContentProps = ComponentProps<typeof PopoverContent>

export const TagsContent = ({ className, children, ...props }: TagsContentProps) => {
  const { width } = useTagsContext()
  return (
    <PopoverContent className={cn("p-0", className)} style={{ width }} {...props}>
      <Command>{children}</Command>
    </PopoverContent>
  )
}

export type TagsInputProps = ComponentProps<typeof CommandInput>

export const TagsInput = ({ className, ...props }: TagsInputProps) => (
  <CommandInput className={cn("h-9", className)} {...props} />
)

export type TagsListProps = ComponentProps<typeof CommandList>

export const TagsList = ({ className, ...props }: TagsListProps) => (
  <CommandList className={cn("max-h-[200px]", className)} {...props} />
)

export type TagsEmptyProps = ComponentProps<typeof CommandEmpty>

export const TagsEmpty = ({ children, ...props }: TagsEmptyProps) => (
  <CommandEmpty {...props}>{children ?? "No tags found."}</CommandEmpty>
)

export type TagsGroupProps = ComponentProps<typeof CommandGroup>

export const TagsGroup = CommandGroup

export type TagsItemProps = ComponentProps<typeof CommandItem>

export const TagsItem = ({ className, ...props }: TagsItemProps) => (
  <CommandItem className={cn("cursor-pointer items-center justify-between", className)} {...props} />
)
