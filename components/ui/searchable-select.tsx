"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface SearchableSelectProps {
    value?: string
    onValueChange?: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    options: Array<{ value: string; label: string }>
    className?: string
    disabled?: boolean
    maxVisible?: number
    searchMessage?: string
    showLabel?: boolean
    label?: string
}

export function SearchableSelect({
    value,
    onValueChange,
    placeholder = "Seleccionar...",
    searchPlaceholder = "Buscar...",
    options,
    className,
    disabled = false,
    maxVisible = 4,
    searchMessage = "busca para encontrar más",
    showLabel = false,
    label
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false)
    const [searchValue, setSearchValue] = React.useState("")

    // Filter options based on search
    const filteredOptions = options.filter((option) =>
        option.label.toLowerCase().includes(searchValue.toLowerCase())
    )

    // Show only maxVisible options when not searching, or all filtered results when searching
    const displayedOptions = searchValue ? filteredOptions : options.slice(0, maxVisible)

    // Get the selected option label
    const selectedLabel = options.find((option) => option.value === value)?.label

    const content = (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "justify-between h-9 w-full whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
                        className
                    )}
                    disabled={disabled}
                >
                    <span className="truncate">
                        {selectedLabel || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onValueChange={setSearchValue}
                    />
                    <CommandList>
                        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                        <CommandGroup>
                            {displayedOptions.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.value}
                                    onSelect={(currentValue) => {
                                        onValueChange?.(currentValue === value ? "" : currentValue)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                            {!searchValue && options.length > maxVisible && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground text-center border-t">
                                    <Search className="inline h-3 w-3 mr-1" />
                                    {searchMessage}
                                </div>
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )

    if (showLabel && label) {
        return (
            <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {label}
                </label>
                {content}
            </div>
        )
    }

    return content
}
