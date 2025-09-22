"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import {
    SearchIcon,
    ChevronDownIcon,
    FilterIcon,
    XIcon
} from "lucide-react"

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(handler)
        }
    }, [value, delay])

    return debouncedValue
}

interface WorkOrderDetailFiltersProps {
    providers?: Array<{ id: string; name: string }>
    materials?: Array<{ id: string; name: string }>
    workOrder: string
}

export function WorkOrderDetailFilters({
    providers = [],
    materials = [],
    workOrder
}: WorkOrderDetailFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Filter states
    const [search, setSearch] = useState(searchParams.get("search") || "")
    const [provider, setProvider] = useState(searchParams.get("provider") || "all")
    const [material, setMaterial] = useState(searchParams.get("material") || "all")
    const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "itemDate")
    const [sortOrder, setSortOrder] = useState(searchParams.get("sortOrder") || "desc")

    // UI state
    const [showFilters, setShowFilters] = useState(false)

    const debouncedSearch = useDebounce(search, 300)

    // Check if any filters are active
    useEffect(() => {
        const hasFilters = !!(
            debouncedSearch ||
            (provider && provider !== 'all') ||
            (material && material !== 'all')
        )

        // Auto-expand filters if there are active filters
        if (hasFilters && !showFilters) {
            setShowFilters(true)
        }
    }, [debouncedSearch, provider, material, showFilters])

    const updateUrlParams = useCallback(() => {
        const params = new URLSearchParams()

        if (debouncedSearch) params.set("search", debouncedSearch)
        if (provider && provider !== 'all') params.set("provider", provider)
        if (material && material !== 'all') params.set("material", material)
        if (sortBy) params.set("sortBy", sortBy)
        if (sortOrder) params.set("sortOrder", sortOrder)

        router.push(`/ordenes-trabajo/${encodeURIComponent(workOrder)}?${params.toString()}`, { scroll: false })
    }, [debouncedSearch, provider, material, sortBy, sortOrder, workOrder, router])

    useEffect(() => {
        updateUrlParams()
    }, [updateUrlParams])

    const clearAllFilters = () => {
        setSearch("")
        setProvider("all")
        setMaterial("all")
        setSortBy("itemDate")
        setSortOrder("desc")
    }

    // Count active filters
    const activeFilterCount = [
        debouncedSearch,
        provider && provider !== 'all' ? provider : null,
        material && material !== 'all' ? material : null
    ].filter(Boolean).length

    const hasActiveFilters = activeFilterCount > 0

    return (
        <div className="space-y-3">
            {/* Compact Filter Toggle */}
            <div className="flex items-center justify-between">
                <Collapsible open={showFilters} onOpenChange={setShowFilters} className="flex-1">
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 border-gray-300 hover:bg-gray-50 text-gray-700"
                        >
                            <FilterIcon className="h-4 w-4 mr-2 text-gray-500" />
                            Filtros y Ordenación
                            {activeFilterCount > 0 && (
                                <Badge variant="secondary" className="ml-2 bg-gray-100 text-gray-700 text-xs">
                                    {activeFilterCount}
                                </Badge>
                            )}
                            <ChevronDownIcon className={`h-4 w-4 ml-2 transition-transform text-gray-400 ${showFilters ? 'rotate-180' : ''}`} />
                        </Button>
                    </CollapsibleTrigger>
                </Collapsible>

                <div className="flex items-center gap-2 ml-3">
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="h-9 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                        >
                            <XIcon className="h-4 w-4 mr-1" />
                            Limpiar
                        </Button>
                    )}
                </div>
            </div>

            {/* Collapsible Filters */}
            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
                <CollapsibleContent>
                    <Card className="border border-gray-200 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">Filtros y Ordenación</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            {/* Quick Search */}
                            <div className="space-y-2">
                                <Label className="text-sm text-gray-600">Buscar en items</Label>
                                <div className="relative">
                                    <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        type="search"
                                        placeholder="Material, proveedor..."
                                        className="pl-10 h-9 border-gray-300 focus:border-gray-400"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Filters Grid */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <SearchableSelect
                                    value={provider}
                                    onValueChange={(value) => setProvider(value || "all")}
                                    placeholder="Todos los proveedores"
                                    searchPlaceholder="Buscar proveedor..."
                                    options={[
                                        { value: "all", label: "Todos los proveedores" },
                                        ...providers.map((prov) => ({ value: prov.id, label: prov.name }))
                                    ]}
                                    className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                    maxVisible={4}
                                    searchMessage="busca para encontrar más"
                                    showLabel={true}
                                    label="Proveedor"
                                />

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Material</Label>
                                    <Select value={material} onValueChange={setMaterial}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos los materiales" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los materiales</SelectItem>
                                            {materials.map((mat) => (
                                                <SelectItem key={mat.id} value={mat.id}>
                                                    {mat.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Ordenar por</Label>
                                    <Select value={sortBy} onValueChange={setSortBy}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="itemDate">Fecha</SelectItem>
                                            <SelectItem value="totalPrice">Precio Total</SelectItem>
                                            <SelectItem value="quantity">Cantidad</SelectItem>
                                            <SelectItem value="unitPrice">Precio Unitario</SelectItem>
                                            <SelectItem value="material">Material</SelectItem>
                                            <SelectItem value="provider">Proveedor</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Orden</Label>
                                    <Select value={sortOrder} onValueChange={setSortOrder}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="desc">Descendente</SelectItem>
                                            <SelectItem value="asc">Ascendente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
