'use client'

import { useState } from "react"
import { useSearchParams } from "next/navigation"
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
import { ExportFilters } from "@/lib/actions/export"
import Link from "next/link"
import { ArrowUpRight, Filter, PencilIcon, TrashIcon, X } from "lucide-react"
import { DeleteProviderDialog } from "./delete-provider-dialog"
import { EditProviderDialog } from "./edit-provider-dialog"
import { Pagination } from "./pagination"

interface SupplierAnalyticsSectionProps {
    supplierAnalytics: SupplierAnalytics[]
    categories: string[]
    workOrders: string[]
}

export function SupplierAnalyticsSection({
    supplierAnalytics,
    categories,
    workOrders
}: SupplierAnalyticsSectionProps) {
    const searchParams = useSearchParams()
    const [filters, setFilters] = useState<ExportFilters>({})
    const [sortBy, setSortBy] = useState<'spent' | 'invoices' | 'materials' | 'name'>('spent')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

    // Pagination params
    const currentPage = parseInt(searchParams.get('page') || '1', 10)
    const itemsPerPage = 20

    // Apply filters and sorting to supplier analytics
    const filteredSuppliers = supplierAnalytics
        .filter(supplier => {
            if (filters.supplierId && supplier.supplierId !== filters.supplierId) return false
            if (filters.supplierCif && !supplier.supplierCif.toLowerCase().includes(filters.supplierCif.toLowerCase())) return false
            if (filters.category) {
                const hasCategory = supplier.topMaterialsByCost.some(m =>
                    m.materialName.toLowerCase().includes(filters.category!.toLowerCase())
                )
                if (!hasCategory) return false
            }
            if (filters.workOrder && !supplier.workOrders.some(wo => wo.toLowerCase().includes(filters.workOrder!.toLowerCase()))) return false
            return true
        })
        .sort((a, b) => {
            let aValue: number, bValue: number
            switch (sortBy) {
                case 'spent':
                    aValue = a.totalSpent
                    bValue = b.totalSpent
                    break
                case 'invoices':
                    aValue = a.invoiceCount
                    bValue = b.invoiceCount
                    break
                case 'materials':
                    aValue = a.materialCount
                    bValue = b.materialCount
                    break
                case 'name':
                    return sortOrder === 'asc'
                        ? a.supplierName.localeCompare(b.supplierName)
                        : b.supplierName.localeCompare(a.supplierName)
                default:
                    aValue = a.totalSpent
                    bValue = b.totalSpent
            }
            return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
        })

    // Pagination logic
    const totalItems = filteredSuppliers.length
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedSuppliers = filteredSuppliers.slice(startIndex, endIndex)

    // Prepare chart data
    const topSuppliersChart = filteredSuppliers.slice(0, 10).map(supplier => ({
        name: supplier.supplierName.length > 15 ? supplier.supplierName.substring(0, 15) + '...' : supplier.supplierName,
        fullName: supplier.supplierName,
        spent: supplier.totalSpent,
        invoices: supplier.invoiceCount
    }))

    const clearFilters = () => {
        setFilters({})
    }

    const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== '')

    return (
        <div className="space-y-6">
            {/* Results Summary */}
            {hasActiveFilters && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                            {filteredSuppliers.length} de {supplierAnalytics.length} proveedores
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
                            {Object.values(filters).filter(v => v !== undefined && v !== '').length} activos
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                    <Label>Proveedor</Label>
                    <Select
                        value={filters.supplierId || 'all'}
                        onValueChange={(value) => setFilters(prev => ({ ...prev, supplierId: value === 'all' ? undefined : value }))}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Todos los proveedores" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los proveedores</SelectItem>
                            {supplierAnalytics.map(supplier => (
                                <SelectItem key={supplier.supplierId} value={supplier.supplierId}>
                                    {supplier.supplierName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>CIF</Label>
                    <Input
                        placeholder="Buscar por CIF..."
                        value={filters.supplierCif || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, supplierCif: e.target.value || undefined }))}
                    />
                </div>

                <div className="space-y-2">
                    <Label>OT/CECO</Label>
                    <Input
                        placeholder="Buscar OT/CECO..."
                        value={filters.workOrder || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, workOrder: e.target.value || undefined }))}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Ordenar por</Label>
                    <div className="flex gap-2">
                        <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'spent' | 'invoices' | 'materials' | 'name')}>
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
                        <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
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
                            {paginatedSuppliers.map((supplier) => (
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