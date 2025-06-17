"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    SearchIcon,
    ChevronDownIcon,
    FilterIcon,
    XIcon,
    DownloadIcon,
    SlidersHorizontalIcon
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

interface MaterialAnalyticsFiltersProps {
    suppliers?: Array<{ id: string; name: string; type: string }>
    categories?: string[]
}

export function MaterialAnalyticsFilters({
    suppliers = [],
    categories = []
}: MaterialAnalyticsFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Basic filters
    const [materialSearch, setMaterialSearch] = useState(searchParams.get("materialSearch") || "")
    const [category, setCategory] = useState(searchParams.get("category") || "")
    const [workOrder, setWorkOrder] = useState(searchParams.get("workOrder") || "")
    const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") || "")
    const [supplierCif, setSupplierCif] = useState(searchParams.get("supplierCif") || "")
    const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "cost")
    const [sortOrder, setSortOrder] = useState(searchParams.get("sortOrder") || "desc")

    // Advanced filters
    const [minUnitPrice, setMinUnitPrice] = useState(searchParams.get("minUnitPrice") || "")
    const [maxUnitPrice, setMaxUnitPrice] = useState(searchParams.get("maxUnitPrice") || "")
    const [minTotalCost, setMinTotalCost] = useState(searchParams.get("minTotalCost") || "")
    const [maxTotalCost, setMaxTotalCost] = useState(searchParams.get("maxTotalCost") || "")
    const [minQuantity, setMinQuantity] = useState(searchParams.get("minQuantity") || "")
    const [maxQuantity, setMaxQuantity] = useState(searchParams.get("maxQuantity") || "")

    // UI state
    const [showFilters, setShowFilters] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(true)

    // Date range state
    const [startDate, setStartDate] = useState(searchParams.get("startDate") || "")
    const [endDate, setEndDate] = useState(searchParams.get("endDate") || "")

    const debouncedMaterialSearch = useDebounce(materialSearch, 300)
    const debouncedWorkOrder = useDebounce(workOrder, 500)
    const debouncedSupplierCif = useDebounce(supplierCif, 500)
    const debouncedMinUnitPrice = useDebounce(minUnitPrice, 500)
    const debouncedMaxUnitPrice = useDebounce(maxUnitPrice, 500)
    const debouncedMinTotalCost = useDebounce(minTotalCost, 500)
    const debouncedMaxTotalCost = useDebounce(maxTotalCost, 500)
    const debouncedMinQuantity = useDebounce(minQuantity, 500)
    const debouncedMaxQuantity = useDebounce(maxQuantity, 500)

    // Check if any filters are active
    useEffect(() => {
        const hasFilters = !!(
            debouncedMaterialSearch ||
            (category && category !== 'all') ||
            debouncedWorkOrder ||
            (supplierId && supplierId !== 'all') ||
            debouncedSupplierCif ||
            startDate ||
            endDate ||
            debouncedMinUnitPrice ||
            debouncedMaxUnitPrice ||
            debouncedMinTotalCost ||
            debouncedMaxTotalCost ||
            debouncedMinQuantity ||
            debouncedMaxQuantity
        )

        // Auto-expand filters if there are active filters
        if (hasFilters && !showFilters) {
            setShowFilters(true)
        }
    }, [
        debouncedMaterialSearch, category, debouncedWorkOrder, supplierId, debouncedSupplierCif,
        startDate, endDate, debouncedMinUnitPrice, debouncedMaxUnitPrice,
        debouncedMinTotalCost, debouncedMaxTotalCost, debouncedMinQuantity,
        debouncedMaxQuantity, showFilters
    ])

    const updateUrlParams = useCallback(() => {
        const params = new URLSearchParams()

        // Basic filters
        if (debouncedMaterialSearch) params.set("materialSearch", debouncedMaterialSearch)
        if (category && category !== 'all') params.set("category", category)
        if (debouncedWorkOrder) params.set("workOrder", debouncedWorkOrder)
        if (supplierId && supplierId !== 'all') params.set("supplierId", supplierId)
        if (debouncedSupplierCif) params.set("supplierCif", debouncedSupplierCif)
        if (sortBy) params.set("sortBy", sortBy)
        if (sortOrder) params.set("sortOrder", sortOrder)

        // Date range
        if (startDate) params.set("startDate", startDate)
        if (endDate) params.set("endDate", endDate)

        // Advanced filters
        if (debouncedMinUnitPrice) params.set("minUnitPrice", debouncedMinUnitPrice)
        if (debouncedMaxUnitPrice) params.set("maxUnitPrice", debouncedMaxUnitPrice)
        if (debouncedMinTotalCost) params.set("minTotalCost", debouncedMinTotalCost)
        if (debouncedMaxTotalCost) params.set("maxTotalCost", debouncedMaxTotalCost)
        if (debouncedMinQuantity) params.set("minQuantity", debouncedMinQuantity)
        if (debouncedMaxQuantity) params.set("maxQuantity", debouncedMaxQuantity)

        router.push(`/materiales?${params.toString()}`, { scroll: false })
    }, [
        debouncedMaterialSearch, category, debouncedWorkOrder, supplierId, debouncedSupplierCif,
        sortBy, sortOrder, startDate, endDate, debouncedMinUnitPrice,
        debouncedMaxUnitPrice, debouncedMinTotalCost, debouncedMaxTotalCost,
        debouncedMinQuantity, debouncedMaxQuantity, router
    ])

    useEffect(() => {
        updateUrlParams()
    }, [updateUrlParams])

    const clearAllFilters = () => {
        setMaterialSearch("")
        setCategory("")
        setWorkOrder("")
        setSupplierId("")
        setSupplierCif("")
        setSortBy("cost")
        setSortOrder("desc")
        setStartDate("")
        setEndDate("")
        setMinUnitPrice("")
        setMaxUnitPrice("")
        setMinTotalCost("")
        setMaxTotalCost("")
        setMinQuantity("")
        setMaxQuantity("")
    }

    // Count active filters
    const activeFilterCount = [
        debouncedMaterialSearch,
        category && category !== 'all' ? category : null,
        debouncedWorkOrder,
        supplierId && supplierId !== 'all' ? supplierId : null,
        debouncedSupplierCif,
        startDate,
        endDate,
        debouncedMinUnitPrice,
        debouncedMaxUnitPrice,
        debouncedMinTotalCost,
        debouncedMaxTotalCost,
        debouncedMinQuantity,
        debouncedMaxQuantity
    ].filter(Boolean).length

    const basicFilterCount = [
        debouncedMaterialSearch,
        category && category !== 'all' ? category : null,
        debouncedWorkOrder,
        supplierId && supplierId !== 'all' ? supplierId : null,
        debouncedSupplierCif,
        startDate,
        endDate
    ].filter(Boolean).length

    const advancedFilterCount = activeFilterCount - basicFilterCount

    const hasActiveFilters = activeFilterCount > 0

    // Auto-expand advanced filters if there are active advanced filters
    useEffect(() => {
        if (advancedFilterCount > 0 && !showAdvanced) {
            setShowAdvanced(true)
        }
    }, [advancedFilterCount, showAdvanced])

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
                            Filtros
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
                        <CardContent className="p-4 space-y-4">
                            {/* Quick Search */}
                            <div className="space-y-2">
                                <div className="relative">
                                    <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        type="search"
                                        placeholder="Buscar por material, código..."
                                        className="pl-10 h-9 border-gray-300 focus:border-gray-400"
                                        value={materialSearch}
                                        onChange={(e) => setMaterialSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Basic Filters */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Categoría</Label>
                                    <Select value={category} onValueChange={setCategory}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            {categories.map((cat) => (
                                                <SelectItem key={cat} value={cat}>
                                                    {cat}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Proveedor</Label>
                                    <Select value={supplierId} onValueChange={setSupplierId}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            {suppliers.map((supplier) => (
                                                <SelectItem key={supplier.id} value={supplier.id}>
                                                    {supplier.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">CIF</Label>
                                    <Input
                                        placeholder="Buscar por CIF..."
                                        className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                        value={supplierCif}
                                        onChange={(e) => setSupplierCif(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">OT / CECO</Label>
                                    <Input
                                        placeholder="Orden de trabajo..."
                                        className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                        value={workOrder}
                                        onChange={(e) => setWorkOrder(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Ordenar por</Label>
                                    <div className="flex gap-1">
                                        <Select value={sortBy} onValueChange={setSortBy}>
                                            <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400 flex-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cost">Coste</SelectItem>
                                                <SelectItem value="quantity">Cantidad</SelectItem>
                                                <SelectItem value="name">Nombre</SelectItem>
                                                <SelectItem value="avgUnitPrice">Precio Prom.</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select value={sortOrder} onValueChange={setSortOrder}>
                                            <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400 w-16">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="desc">↓</SelectItem>
                                                <SelectItem value="asc">↑</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Date Range - Separate Row */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Fecha Inicio</Label>
                                    <Input
                                        type="date"
                                        className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Fecha Fin</Label>
                                    <Input
                                        type="date"
                                        className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Advanced Filters Toggle */}
                            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-between hover:bg-gray-50 h-8 text-sm text-gray-600"
                                    >
                                        <div className="flex items-center gap-2">
                                            <SlidersHorizontalIcon className="h-3 w-3" />
                                            <span>Filtros Avanzados</span>
                                            {advancedFilterCount > 0 && (
                                                <Badge variant="outline" className="text-xs">
                                                    {advancedFilterCount}
                                                </Badge>
                                            )}
                                        </div>
                                        <ChevronDownIcon className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                                    </Button>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="space-y-3 pt-3">
                                    <Separator className="bg-gray-200" />

                                    {/* Advanced Filters Grid */}
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Precio Unit. Mín. €</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={minUnitPrice}
                                                onChange={(e) => setMinUnitPrice(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Precio Unit. Máx. €</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={maxUnitPrice}
                                                onChange={(e) => setMaxUnitPrice(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Coste Total Mín. €</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={minTotalCost}
                                                onChange={(e) => setMinTotalCost(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Coste Total Máx. €</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={maxTotalCost}
                                                onChange={(e) => setMaxTotalCost(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Cantidad Mín.</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={minQuantity}
                                                onChange={(e) => setMinQuantity(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Cantidad Máx.</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={maxQuantity}
                                                onChange={(e) => setMaxQuantity(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </CardContent>
                    </Card>
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
} 