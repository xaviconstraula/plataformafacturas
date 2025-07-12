'use client'

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from "@/lib/utils"
import { SupplierAnalytics } from "@/lib/actions/analytics"
import Link from "next/link"
import { ArrowUpRight, Filter, PencilIcon, TrashIcon, X } from "lucide-react"
import { DeleteProviderDialog } from "./delete-provider-dialog"
import { EditProviderDialog } from "./edit-provider-dialog"
import { Pagination } from "./pagination"
import { useCallback, useRef, useState, useEffect } from "react"

interface SupplierAnalyticsSectionProps {
    supplierAnalytics: SupplierAnalytics[]
    categories: string[]
    workOrders: string[]
    allSuppliers: { id: string; name: string }[]
    pagination?: {
        currentPage: number
        totalPages: number
        pageSize: number
        totalCount: number
    }
}

export function SupplierAnalyticsSection({
    supplierAnalytics,
    categories,
    workOrders,
    allSuppliers,
    pagination
}: SupplierAnalyticsSectionProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    // Local state for text inputs to enable debouncing
    const [localCif, setLocalCif] = useState(searchParams.get('supplierCif') || '')
    const [localWorkOrder, setLocalWorkOrder] = useState(searchParams.get('workOrder') || '')
    const [localStartDate, setLocalStartDate] = useState(searchParams.get('startDate') || '')
    const [localEndDate, setLocalEndDate] = useState(searchParams.get('endDate') || '')

    // Debounce timers
    const cifTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
    const workOrderTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
    const startDateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
    const endDateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

    // Extract current filter values from URL
    const currentSupplier = searchParams.get('supplierId') || 'all'
    const currentSupplierType = searchParams.get('supplierType') || 'all'
    const currentMaterialCategory = searchParams.get('materialCategory') || 'all'
    const currentSortBy = searchParams.get('sortBy') || 'spent'
    const currentSortOrder = searchParams.get('sortOrder') || 'desc'

    // Update local state when URL changes (e.g., when filters are cleared)
    useEffect(() => {
        setLocalCif(searchParams.get('supplierCif') || '')
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

        // Reset to page 1 when filters change
        if (Object.keys(updates).some(key => key !== 'page' && key !== 'sortBy' && key !== 'sortOrder')) {
            params.delete('page')
        }

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

    // Handle CIF input change
    const handleCifChange = useCallback((value: string) => {
        setLocalCif(value)
        debouncedUpdate('supplierCif', value, cifTimeoutRef)
    }, [debouncedUpdate])

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

    // Use server-side pagination data or fall back to client-side for backward compatibility
    const currentPage = pagination?.currentPage || parseInt(searchParams.get('page') || '1', 10)
    const totalPages = pagination?.totalPages || Math.ceil(supplierAnalytics.length / 20)
    const itemsPerPage = pagination?.pageSize || 20
    const totalItems = pagination?.totalCount || supplierAnalytics.length

    // For server-side pagination, suppliers are already filtered and paginated
    const displaySuppliers = supplierAnalytics

    // Prepare chart data from display suppliers
    const topSuppliersChart = displaySuppliers.slice(0, 10).map(supplier => ({
        name: supplier.supplierName.length > 15 ? supplier.supplierName.substring(0, 15) + '...' : supplier.supplierName,
        fullName: supplier.supplierName,
        spent: supplier.totalSpent,
        invoices: supplier.invoiceCount
    }))

    const clearFilters = () => {
        // Clear any pending timeouts
        if (cifTimeoutRef.current) {
            clearTimeout(cifTimeoutRef.current)
        }
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
        setLocalCif('')
        setLocalWorkOrder('')
        setLocalStartDate('')
        setLocalEndDate('')

        // Navigate to clean URL
        router.push(pathname)
    }

    const hasActiveFilters = searchParams.toString() !== '' &&
        Array.from(searchParams.entries()).some(([key, value]) =>
            !['page', 'sortBy', 'sortOrder'].includes(key) && value !== 'all' && value !== ''
        )

    return (
        <div className="space-y-6">
            {/* Results Summary */}
            {hasActiveFilters && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                            {totalItems} de {allSuppliers.length} proveedores
                        </Badge>
                        {hasActiveFilters && (
                            <Badge variant="outline">
                                Filtros aplicados
                            </Badge>
                        )}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                        <Badge variant="secondary">
                            {Array.from(searchParams.entries()).filter(([key, value]) =>
                                !['page', 'sortBy', 'sortOrder'].includes(key) && value !== 'all' && value !== ''
                            ).length} activos
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                            <X className="h-4 w-4 mr-1" />
                            Limpiar
                        </Button>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                {/* First row - Main filters */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <div className="space-y-2">
                        <Label>Proveedor</Label>
                        <Select
                            value={currentSupplier}
                            onValueChange={(value) => updateSearchParams({ supplierId: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Todos los proveedores" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los proveedores</SelectItem>
                                {allSuppliers.map(supplier => (
                                    <SelectItem key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>CIF</Label>
                        <Input
                            placeholder="Buscar por CIF..."
                            value={localCif}
                            onChange={(e) => handleCifChange(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                            value={currentSupplierType}
                            onValueChange={(value) => updateSearchParams({ supplierType: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Todos los tipos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los tipos</SelectItem>
                                <SelectItem value="MATERIAL_SUPPLIER">Material</SelectItem>
                                <SelectItem value="MACHINERY_RENTAL">Maquinaria</SelectItem>
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
                </div>

                {/* Second row - Date filters and sorting */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

                    <div className="space-y-2">
                        <Label>Ordenar por</Label>
                        <div className="flex gap-2">
                            <Select
                                value={currentSortBy}
                                onValueChange={(value) => updateSearchParams({ sortBy: value })}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="spent">Gasto Total</SelectItem>
                                    <SelectItem value="invoices">Nº Facturas</SelectItem>
                                    <SelectItem value="materials">Nº Materiales</SelectItem>
                                    <SelectItem value="name">Nombre</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                value={currentSortOrder}
                                onValueChange={(value) => updateSearchParams({ sortOrder: value })}
                            >
                                <SelectTrigger className="w-24">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="desc">Desc</SelectItem>
                                    <SelectItem value="asc">Asc</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>


            {/* Chart */}
            {/* <Card>
                <CardHeader>
                    <CardTitle>Top 10 Proveedores por Gasto</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={topSuppliersChart}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 10 }}
                            />
                            <YAxis
                                tickFormatter={(value) => formatCurrency(value)}
                                tick={{ fontSize: 11 }}
                            />
                            <Tooltip
                                formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                                labelFormatter={(label: string, payload: Array<{ payload?: { fullName?: string } }>) => {
                                    const entry = payload?.[0]?.payload
                                    return entry?.fullName || label
                                }}
                            />
                            <Bar dataKey="spent" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card> */}

            {/* Analytics Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Análisis de Proveedores</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Proveedor</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead >Gasto Total</TableHead>
                                <TableHead >Nº Facturas</TableHead>
                                <TableHead >Nº Materiales</TableHead>
                                <TableHead >Promedio/Factura</TableHead>
                                <TableHead className="w-[100px]">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displaySuppliers.map((supplier) => (
                                <TableRow key={supplier.supplierId}>
                                    <TableCell>
                                        <Link
                                            href={`/proveedores/${supplier.supplierId}`}
                                            className="font-medium hover:underline flex items-center gap-1"
                                        >
                                            {supplier.supplierName}
                                            <ArrowUpRight className="h-3 w-3" />
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={supplier.supplierType === 'MATERIAL_SUPPLIER' ? 'default' : 'secondary'}>
                                            {supplier.supplierType === 'MATERIAL_SUPPLIER' ? 'Material' : 'Maquinaria'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium text-center">{formatCurrency(supplier.totalSpent)}</TableCell>
                                    <TableCell className="font-medium text-center">{supplier.invoiceCount}</TableCell>
                                    <TableCell className="font-medium text-center">{supplier.materialCount}</TableCell>
                                    <TableCell className="font-medium text-center">{formatCurrency(supplier.averageInvoiceAmount)}</TableCell>
                                    <TableCell className="space-x-1">
                                        <EditProviderDialog
                                            providerId={supplier.supplierId}
                                            initialData={{
                                                name: supplier.supplierName,
                                                type: supplier.supplierType,
                                                cif: supplier.supplierCif,
                                                email: supplier.email,
                                                phone: supplier.phone,
                                                address: supplier.address,
                                            }}
                                        >
                                            <Button variant="ghost" size="icon" aria-label="Editar proveedor">
                                                <PencilIcon className="h-4 w-4" />
                                            </Button>
                                        </EditProviderDialog>
                                        <DeleteProviderDialog
                                            providerId={supplier.supplierId}
                                            providerName={supplier.supplierName}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive"
                                                aria-label="Eliminar proveedor"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </Button>
                                        </DeleteProviderDialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="mt-4">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            itemsPerPage={itemsPerPage}
                            totalItems={totalItems}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 