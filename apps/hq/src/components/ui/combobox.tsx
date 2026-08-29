"use client"

/* Kibo UI combobox composition, hand-ported onto the FieldLoop primitives
   (Button / Command / Popover). Context-wired parts keep the Kibo API:
   Combobox, ComboboxTrigger, ComboboxContent, ComboboxInput, ComboboxList,
   ComboboxEmpty, ComboboxGroup, ComboboxItem, ComboboxSeparator,
   ComboboxCreateNew. */

import { ChevronsUpDown, Plus } from "lucide-react"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type ComboboxData = { label: string; value: string }

type ComboboxContextType = {
  data: ComboboxData[]
  type: string
  value: string
  onValueChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  width: number
  setWidth: (width: number) => void
  inputValue: string
  setInputValue: (value: string) => void
}

const ComboboxContext = createContext<ComboboxContextType>({
  data: [],
  type: "item",
  value: "",
  onValueChange: () => {},
  open: false,
  onOpenChange: () => {},
  width: 200,
  setWidth: () => {},
  inputValue: "",
  setInputValue: () => {}
})

export type ComboboxProps = Omit<ComponentProps<typeof Popover>, "open" | "onOpenChange"> & {
  data: ComboboxData[]
  type: string
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const Combobox = ({
  data,
  type,
  defaultValue,
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}: ComboboxProps) => {
  const isControlled = controlledValue !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "")
  const value = isControlled ? controlledValue : uncontrolledValue
  const onValueChange = (next: string) => {
    if (!isControlled) setUncontrolledValue(next)
    controlledOnValueChange?.(next)
  }

  const isOpenControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = isOpenControlled ? controlledOpen : uncontrolledOpen
  const onOpenChange = (next: boolean) => {
    if (!isOpenControlled) setUncontrolledOpen(next)
    controlledOnOpenChange?.(next)
  }

  const [width, setWidth] = useState(200)
  const [inputValue, setInputValue] = useState("")

  return (
    <ComboboxContext.Provider
      value={{
        type,
        value,
        onValueChange,
        open,
        onOpenChange,
        data,
        width,
        setWidth,
        inputValue,
        setInputValue
      }}
    >
      <Popover open={open} onOpenChange={onOpenChange} {...props} />
    </ComboboxContext.Provider>
  )
}

export type ComboboxTriggerProps = ComponentProps<typeof Button>

export const ComboboxTrigger = ({ children, ...props }: ComboboxTriggerProps) => {
  const { value, data, type, setWidth } = useContext(ComboboxContext)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const trigger = ref.current
    if (!trigger) return
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newWidth = (entry.target as HTMLElement).offsetWidth
        if (newWidth) setWidth(newWidth)
      }
    })
    resizeObserver.observe(trigger)
    return () => resizeObserver.disconnect()
  }, [setWidth])

  return (
    <PopoverTrigger asChild>
      <Button variant="outline" ref={ref} {...props}>
        {children ?? (
          <span className="flex w-full items-center justify-between gap-2">
            {value ? data.find(item => item.value === value)?.label : `Select ${type}...`}
            <ChevronsUpDown className="shrink-0 text-ink-low" size={16} />
          </span>
        )}
      </Button>
    </PopoverTrigger>
  )
}

export type ComboboxContentProps = ComponentProps<typeof Command> & {
  popoverOptions?: ComponentProps<typeof PopoverContent>
}

export const ComboboxContent = ({ className, popoverOptions, ...props }: ComboboxContentProps) => {
  const { width } = useContext(ComboboxContext)
  return (
    <PopoverContent className={cn("p-0", className)} style={{ width }} {...popoverOptions}>
      <Command {...props} />
    </PopoverContent>
  )
}

export type ComboboxInputProps = ComponentProps<typeof CommandInput>

export const ComboboxInput = ({ onValueChange, ...props }: ComboboxInputProps) => {
  const { type, inputValue, setInputValue } = useContext(ComboboxContext)
  return (
    <CommandInput
      placeholder={`Search ${type}...`}
      value={inputValue}
      onValueChange={next => {
        setInputValue(next)
        onValueChange?.(next)
      }}
      {...props}
    />
  )
}

export type ComboboxListProps = ComponentProps<typeof CommandList>

export const ComboboxList = (props: ComboboxListProps) => <CommandList {...props} />

export type ComboboxEmptyProps = ComponentProps<typeof CommandEmpty>

export const ComboboxEmpty = ({ children, ...props }: ComboboxEmptyProps) => {
  const { type } = useContext(ComboboxContext)
  return <CommandEmpty {...props}>{children ?? `No ${type} found.`}</CommandEmpty>
}

export type ComboboxGroupProps = ComponentProps<typeof CommandGroup>

export const ComboboxGroup = (props: ComboboxGroupProps) => <CommandGroup {...props} />

export type ComboboxItemProps = ComponentProps<typeof CommandItem>

export const ComboboxItem = ({ value, onSelect, ...props }: ComboboxItemProps) => {
  const { onValueChange, onOpenChange } = useContext(ComboboxContext)
  return (
    <CommandItem
      value={value}
      onSelect={currentValue => {
        onValueChange(currentValue)
        onOpenChange(false)
        onSelect?.(currentValue)
      }}
      {...props}
    />
  )
}

export type ComboboxSeparatorProps = ComponentProps<typeof CommandSeparator>

export const ComboboxSeparator = (props: ComboboxSeparatorProps) => (
  <CommandSeparator {...props} />
)

export type ComboboxCreateNewProps = {
  onCreateNew: (value: string) => void
  children?: (inputValue: string) => ReactNode
  className?: string
}

export const ComboboxCreateNew = ({ onCreateNew, children, className }: ComboboxCreateNewProps) => {
  const { inputValue, type, onValueChange, onOpenChange } = useContext(ComboboxContext)

  if (!inputValue.trim()) return null

  const handleCreateNew = () => {
    onCreateNew(inputValue.trim())
    onValueChange(inputValue.trim())
    onOpenChange(false)
  }

  return (
    <button
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-fill aria-selected:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onClick={handleCreateNew}
      type="button"
    >
      {children ? (
        children(inputValue)
      ) : (
        <>
          <Plus className="h-4 w-4 text-ink-low" />
          <span>{`Create new ${type}: "${inputValue}"`}</span>
        </>
      )}
    </button>
  )
}
