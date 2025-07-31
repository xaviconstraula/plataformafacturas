'use client'

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, Filter } from "lucide-react"

interface SupplierDetailFiltersProps {
    categories?: string[]
    workOrders?: string[]
}

export function SupplierDetailFilters({
    categories = [],
    workOrders = []
}: SupplierDetailFiltersProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    // Local state for text inputs to enable debouncing
    const [localWorkOrder, setLocalWorkOrder] = useState(searchParams.get('workOrder') || '')
    const [localStartDate, setLocalStartDate] = useState(searchParams.get('startDate') || '')
    const [localEndDate, setLocalEndDate] = useState(searchParams.get('endDate') || '')

    // Debounce timers
    const workOrderTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
    const startDateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
    const endDateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

    // Extract current filter values from URL
    const currentCategory = searchParams.get('category') || 'all'
    const currentTab = searchParams.get('tab') || 'invoices'

    // Update local state when URL changes (e.g., when filters are cleared)
    useEffect(() => {
        setLocalWorkOrder(searchParams.get('workOrder') || '')
        setLocalStartDate(searchParams.get('startDate') || '')
        setLocalEndDate(searchParams.get('endDate') || '')
    }, [searchParams])

    // Function to update URL with new search params
    const updateSearchParams = useCallback((updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString())

        Object.entries(updates).forEach(([key, value]) => {
            if (value && value !== 'all' && value !== '') {
                params.set(key, value)
            } else {
                params.delete(key)
            }
        })

        router.push(`${pathname}?${params.toString()}`)
    }, [searchParams, router, pathname])

    // Debounced update function for text inputs
    const debouncedUpdate = useCallback((key: string, value: string, timeoutRef: React.MutableRefObject<NodeJS.Timeout | undefined>) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
        }

        timeoutRef.current = setTimeout(() => {
            updateSearchParams({ [key]: value })
        }, 500) // 500ms delay
    }, [updateSearchParams])

    // Handle Work Order input change
    const handleWorkOrderChange = useCallback((value: string) => {
        setLocalWorkOrder(value)
        debouncedUpdate('workOrder', value, workOrderTimeoutRef)
    }, [debouncedUpdate])

    // Handle Start Date change
    const handleStartDateChange = useCallback((value: string) => {
        setLocalStartDate(value)
        debouncedUpdate('startDate', value, startDateTimeoutRef)
    }, [debouncedUpdate])

    // Handle End Date change
    const handleEndDateChange = useCallback((value: string) => {
        setLocalEndDate(value)
        debouncedUpdate('endDate', value, endDateTimeoutRef)
    }, [debouncedUpdate])

    const clearFilters = () => {
        // Clear any pending timeouts
        if (workOrderTimeoutRef.current) {
            clearTimeout(workOrderTimeoutRef.current)
        }
        if (startDateTimeoutRef.current) {
            clearTimeout(startDateTimeoutRef.current)
        }
        if (endDateTimeoutRef.current) {
            clearTimeout(endDateTimeoutRef.current)
        }

        // Reset local state
        setLocalWorkOrder('')
        setLocalStartDate('')
        setLocalEndDate('')

        // Keep only the tab parameter
        const newParams = new URLSearchParams()
        if (currentTab) {
            newParams.set('tab', currentTab)
        }
        router.push(`${pathname}?${newParams.toString()}`)
    }

    const hasActiveFilters = searchParams.toString() !== '' &&
        Array.from(searchParams.entries()).some(([key, value]) =>
            !['tab'].includes(key) && value !== 'all' && value !== ''
        )

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filtros
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {hasActiveFilters && (
                            <Badge variant="secondary">
                                {Array.from(searchParams.entries()).filter(([key, value]) =>
                                    !['tab'].includes(key) && value !== 'all' && value !== ''
                                ).length} activos
                            </Badge>
                        )}
                        {hasActiveFilters && (
                            <Button variant="outline" size="sm" onClick={clearFilters}>
                                <X className="h-4 w-4 mr-1" />
                                Limpiar
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

                    <div className="space-y-2">
                        <Label>Categoría</Label>
                        <Select
                            value={currentCategory}
                            onValueChange={(value) => updateSearchParams({ category: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Todas las categorías" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las categorías</SelectItem>
                                {categories.map(category => (
                                    <SelectItem key={category} value={category}>
                                        {category}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>OT/CECO</Label>
                        <Input
                            placeholder="Buscar OT/CECO..."
                            value={localWorkOrder}
                            onChange={(e) => handleWorkOrderChange(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Fecha desde</Label>
                        <Input
                            type="date"
                            value={localStartDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Fecha hasta</Label>
                        <Input
                            type="date"
                            value={localEndDate}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}