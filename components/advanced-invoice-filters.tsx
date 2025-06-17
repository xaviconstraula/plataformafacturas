"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
    XIcon,
    DownloadIcon,
    CalendarIcon,
    BuildingIcon,
    PackageIcon,
    TagIcon,
    DollarSignIcon,
    ClipboardListIcon,
    SlidersHorizontalIcon
} from "lucide-react"
import { Separator } from "@/components/ui/separator"

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

interface AdvancedInvoiceFiltersProps {
    suppliers?: Array<{ id: string; name: string; type: string }>
    materials?: Array<{ id: string; name: string; code: string; category?: string }>
    categories?: string[]
    workOrders?: string[]
    onExport?: () => void
}

export function AdvancedInvoiceFilters({
    suppliers = [],
    materials = [],
    categories = [],
    workOrders = [],
    onExport
}: AdvancedInvoiceFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Basic filters
    const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "")
    const [month, setMonth] = useState(searchParams.get("month") || "")
    const [quarter, setQuarter] = useState(searchParams.get("quarter") || "")
    const [year, setYear] = useState(searchParams.get("year") || "")
    const [fiscalYear, setFiscalYear] = useState(searchParams.get("fiscalYear") || "")
    const [supplier, setSupplier] = useState(searchParams.get("supplier") || "")

    // Advanced filters
    const [workOrder, setWorkOrder] = useState(searchParams.get("workOrder") || "")
    const [material, setMaterial] = useState(searchParams.get("material") || "")
    const [category, setCategory] = useState(searchParams.get("category") || "")
    const [supplierCif, setSupplierCif] = useState(searchParams.get("supplierCif") || "")
    const [minAmount, setMinAmount] = useState(searchParams.get("minAmount") || "")
    const [maxAmount, setMaxAmount] = useState(searchParams.get("maxAmount") || "")

    const [showFilters, setShowFilters] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(true)
    const [hasActiveFilters, setHasActiveFilters] = useState(false)

    const debouncedSearchTerm = useDebounce(searchTerm, 300)
    const debouncedWorkOrder = useDebounce(workOrder, 500)
    const debouncedSupplierCif = useDebounce(supplierCif, 500)
    const debouncedMinAmount = useDebounce(minAmount, 500)
    const debouncedMaxAmount = useDebounce(maxAmount, 500)

    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

    // Check if any filters are active
    useEffect(() => {
        const hasFilters = !!(
            debouncedSearchTerm ||
            month ||
            quarter ||
            year ||
            fiscalYear ||
            supplier ||
            debouncedWorkOrder ||
            material ||
            category ||
            debouncedSupplierCif ||
            debouncedMinAmount ||
            debouncedMaxAmount
        )
        setHasActiveFilters(hasFilters)

        // Auto-expand filters if there are active filters
        if (hasFilters && !showFilters) {
            setShowFilters(true)
        }
    }, [
        debouncedSearchTerm, month, quarter, year, fiscalYear, supplier,
        debouncedWorkOrder, material, category, debouncedSupplierCif, debouncedMinAmount, debouncedMaxAmount, showFilters
    ])

    const updateUrlParams = useCallback(() => {
        const params = new URLSearchParams()

        // Basic filters
        if (debouncedSearchTerm) params.set("search", debouncedSearchTerm)
        if (month && month !== 'all') params.set("month", month)
        if (quarter && quarter !== 'all') params.set("quarter", quarter)
        if (year && year !== 'all') params.set("year", year)
        if (fiscalYear && fiscalYear !== 'all') params.set("fiscalYear", fiscalYear)
        if (supplier && supplier !== 'all') params.set("supplier", supplier)

        // Advanced filters
        if (debouncedWorkOrder) params.set("workOrder", debouncedWorkOrder)
        if (material && material !== 'all') params.set("material", material)
        if (category && category !== 'all') params.set("category", category)
        if (debouncedSupplierCif) params.set("supplierCif", debouncedSupplierCif)
        if (debouncedMinAmount) params.set("minAmount", debouncedMinAmount)
        if (debouncedMaxAmount) params.set("maxAmount", debouncedMaxAmount)

        // Reset page when filters change
        params.set("page", "1")

        router.push(`/facturas?${params.toString()}`, { scroll: false })
    }, [
        debouncedSearchTerm, month, quarter, year, fiscalYear, supplier,
        debouncedWorkOrder, material, category, debouncedSupplierCif, debouncedMinAmount, debouncedMaxAmount, router
    ])

    useEffect(() => {
        updateUrlParams()
    }, [updateUrlParams])

    const clearAllFilters = () => {
        setSearchTerm("")
        setMonth("")
        setQuarter("")
        setYear("")
        setFiscalYear("")
        setSupplier("")
        setWorkOrder("")
        setMaterial("")
        setCategory("")
        setSupplierCif("")
        setMinAmount("")
        setMaxAmount("")
    }

    const handleMonthChange = (value: string) => {
        setMonth(value)
        if (value && value !== 'all') {
            setQuarter('all')
            setFiscalYear('all')
        }
    }

    const handleQuarterChange = (value: string) => {
        setQuarter(value)
        if (value && value !== 'all') {
            setMonth('all')
            setFiscalYear('all')
        }
    }

    const handleYearChange = (value: string) => {
        setYear(value)
        if (value && value !== 'all') {
            setFiscalYear('all')
        }
    }

    const handleFiscalYearChange = (value: string) => {
        setFiscalYear(value)
        if (value && value !== 'all') {
            setMonth('all')
            setQuarter('all')
            setYear('all')
        }
    }

    // Count active filters
    const activeFilterCount = [
        debouncedSearchTerm,
        month && month !== 'all' ? month : null,
        quarter && quarter !== 'all' ? quarter : null,
        year && year !== 'all' ? year : null,
        fiscalYear && fiscalYear !== 'all' ? fiscalYear : null,
        supplier && supplier !== 'all' ? supplier : null,
        debouncedWorkOrder,
        material && material !== 'all' ? material : null,
        category && category !== 'all' ? category : null,
        debouncedSupplierCif,
        debouncedMinAmount,
        debouncedMaxAmount
    ].filter(Boolean).length

    const basicFilterCount = [
        debouncedSearchTerm,
        month && month !== 'all' ? month : null,
        quarter && quarter !== 'all' ? quarter : null,
        year && year !== 'all' ? year : null,
        fiscalYear && fiscalYear !== 'all' ? fiscalYear : null,
        supplier && supplier !== 'all' ? supplier : null
    ].filter(Boolean).length

    const advancedFilterCount = activeFilterCount - basicFilterCount

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
                    {onExport && (
                        <Button variant="outline" size="sm" className="h-9 border-gray-300 hover:bg-gray-50 text-gray-700">
                            <DownloadIcon className="h-4 w-4 mr-1" />
                            Exportar
                        </Button>
                    )}
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
                            {/* Quick Search - Always Visible */}
                            <div className="space-y-2">
                                <div className="relative">
                                    <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        type="search"
                                        placeholder="Buscar por proveedor, material, código..."
                                        className="pl-10 h-9 border-gray-300 focus:border-gray-400"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Basic Filters - Compact Layout */}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Año Fiscal</Label>
                                    <Select value={fiscalYear} onValueChange={handleFiscalYearChange}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            {years.map((y) => (
                                                <SelectItem key={y} value={y.toString()}>
                                                    {y}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Año</Label>
                                    <Select value={year} onValueChange={handleYearChange}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            {years.map((y) => (
                                                <SelectItem key={y} value={y.toString()}>
                                                    {y}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Trimestre</Label>
                                    <Select value={quarter} onValueChange={handleQuarterChange}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="1">T1</SelectItem>
                                            <SelectItem value="2">T2</SelectItem>
                                            <SelectItem value="3">T3</SelectItem>
                                            <SelectItem value="4">T4</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Mes</Label>
                                    <Select value={month} onValueChange={handleMonthChange}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="1">Ene</SelectItem>
                                            <SelectItem value="2">Feb</SelectItem>
                                            <SelectItem value="3">Mar</SelectItem>
                                            <SelectItem value="4">Abr</SelectItem>
                                            <SelectItem value="5">May</SelectItem>
                                            <SelectItem value="6">Jun</SelectItem>
                                            <SelectItem value="7">Jul</SelectItem>
                                            <SelectItem value="8">Ago</SelectItem>
                                            <SelectItem value="9">Sep</SelectItem>
                                            <SelectItem value="10">Oct</SelectItem>
                                            <SelectItem value="11">Nov</SelectItem>
                                            <SelectItem value="12">Dic</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Proveedor</Label>
                                    <Select value={supplier} onValueChange={setSupplier}>
                                        <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            {suppliers.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>
                                                    {s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-600">Material</Label>
                                    <Input
                                        placeholder="Buscar material..."
                                        className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                        value={material === 'all' ? '' : material}
                                        onChange={(e) => setMaterial(e.target.value || 'all')}
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
                                            <Label className="text-xs text-gray-600">OT / CECO</Label>
                                            <Input
                                                placeholder="Orden de trabajo..."
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={workOrder}
                                                onChange={(e) => setWorkOrder(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">CIF Proveedor</Label>
                                            <Input
                                                placeholder="Buscar por CIF..."
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={supplierCif}
                                                onChange={(e) => setSupplierCif(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Categoría</Label>
                                            <Select value={category} onValueChange={setCategory}>
                                                <SelectTrigger className="h-8 text-sm border-gray-300 focus:border-gray-400">
                                                    <SelectValue placeholder="Todas" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todas</SelectItem>
                                                    {categories.map((c) => (
                                                        <SelectItem key={c} value={c}>
                                                            {c}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Monto Mín. €</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={minAmount}
                                                onChange={(e) => setMinAmount(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-600">Monto Máx. €</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="h-8 text-sm border-gray-300 focus:border-gray-400"
                                                value={maxAmount}
                                                onChange={(e) => setMaxAmount(e.target.value)}
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