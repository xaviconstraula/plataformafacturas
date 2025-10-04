'use client'

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExcelExportButton } from "@/components/excel-export-button"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { formatCurrency } from "@/lib/utils"
import { MaterialAnalytics, SupplierAnalytics } from "@/lib/actions/analytics"
import { ExportFilters } from "@/lib/actions/export"
import { ProviderType } from "@/generated/prisma"
import Link from "next/link"
import { DollarSign, Package, Users, Filter, X } from "lucide-react"

interface AnalyticsDashboardProps {
    materialAnalytics: MaterialAnalytics[]
    supplierAnalytics: SupplierAnalytics[]
    suppliers: Array<{ id: string; name: string; type: ProviderType }>
    materials: Array<{ id: string; name: string; code: string; category?: string }>
    categories: string[]
    workOrders: string[]
}

export function AnalyticsDashboard({
    materialAnalytics,
    supplierAnalytics,
    suppliers,
    materials,
    categories,
    workOrders
}: AnalyticsDashboardProps) {
    const [filters, setFilters] = useState<ExportFilters>({})
    const [sortBy, setSortBy] = useState<'quantity' | 'cost' | 'name'>('cost')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

    // Apply filters and sorting to material analytics
    const filteredMaterials = materialAnalytics
        .filter(material => {
            if (filters.category && !material.category?.toLowerCase().includes(filters.category.toLowerCase())) return false
            if (filters.supplierId && !material.topSuppliers.some(s => s.supplierId === filters.supplierId)) return false
            if (filters.workOrder && !material.workOrders.some(wo => wo.toLowerCase().includes(filters.workOrder!.toLowerCase()))) return false
            return true
        })
        .sort((a, b) => {
            let aValue: number, bValue: number
            switch (sortBy) {
                case 'quantity':
                    aValue = a.totalQuantity
                    bValue = b.totalQuantity
                    break
                case 'cost':
                    aValue = a.totalCost
                    bValue = b.totalCost
                    break
                case 'name':
                    return sortOrder === 'asc'
                        ? a.materialName.localeCompare(b.materialName)
                        : b.materialName.localeCompare(a.materialName)
                default:
                    aValue = a.totalCost
                    bValue = b.totalCost
            }
            return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
        })

    // Apply filters to supplier analytics
    const filteredSuppliers = supplierAnalytics
        .filter(supplier => {
            if (filters.supplierId && supplier.supplierId !== filters.supplierId) return false
            if (filters.supplierCif && !supplier.supplierCif.toLowerCase().includes(filters.supplierCif.toLowerCase())) return false
            return true
        })
        .sort((a, b) => b.totalSpent - a.totalSpent)

    // Calculate summary statistics
    const totalSpent = filteredSuppliers.reduce((sum, supplier) => sum + supplier.totalSpent, 0)
    const totalMaterials = filteredMaterials.length
    const totalQuantity = filteredMaterials.reduce((sum, material) => sum + material.totalQuantity, 0)
    const totalSuppliers = filteredSuppliers.length

    // Prepare chart data with better text handling
    const topMaterialsChart = filteredMaterials.slice(0, 10).map(material => ({
        name: material.materialName.length > 15 ? material.materialName.substring(0, 15) + '...' : material.materialName,
        fullName: material.materialName,
        cost: material.totalCost,
        quantity: material.totalQuantity
    }))

    const topSuppliersChart = filteredSuppliers.slice(0, 10).map(supplier => ({
        name: supplier.supplierName.length > 15 ? supplier.supplierName.substring(0, 15) + '...' : supplier.supplierName,
        fullName: supplier.supplierName,
        spent: supplier.totalSpent,
        invoices: supplier.invoiceCount
    }))

    // Prepare monthly evolution chart data
    const monthlyEvolutionData = (() => {
        const monthlyMap = new Map<string, number>()

        // Aggregate monthly spending from filtered suppliers
        filteredSuppliers.forEach(supplier => {
            supplier.monthlySpending.forEach(monthData => {
                const existingAmount = monthlyMap.get(monthData.month) || 0
                monthlyMap.set(monthData.month, existingAmount + monthData.totalSpent)
            })
        })

        // Convert to array and sort by month
        return Array.from(monthlyMap.entries())
            .map(([month, totalSpent]) => ({
                month,
                totalSpent,
                formattedMonth: new Date(month + '-01').toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short'
                })
            }))
            .sort((a, b) => a.month.localeCompare(b.month))
    })()

    const clearFilters = () => {
        setFilters({})
    }

    const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== '')

    return (
        <div className="space-y-6">
            {/* Summary Stats - Flattened Design */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Gasto Total</div>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{formatCurrency(totalSpent)}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Materiales</div>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalMaterials}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                        <Link href="/materiales" className="hover:underline">Ver análisis detallado →</Link>
                    </div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Proveedores</div>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalSuppliers}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                        <Link href="/proveedores" className="hover:underline">Ver análisis detallado →</Link>
                    </div>
                </div>

                <Link href="/ordenes-trabajo" className="block transition-all duration-200 hover:shadow-md hover:scale-[1.02]">
                    <div className="p-6 rounded-lg bg-white border border-border shadow-sm cursor-pointer hover:bg-muted/50">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-muted-foreground">Órdenes de Trabajo</div>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="text-3xl font-bold mt-2">{workOrders.length}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            <span className="text-blue-600 hover:underline">Ver desglose completo →</span>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Filter className="h-5 w-5" />
                            <CardTitle>Filtros</CardTitle>
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
                            <ExcelExportButton filters={{ ...filters, exportType: 'analytics' }} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <SearchableSelect
                            value={filters.supplierId || 'all'}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, supplierId: value === 'all' ? undefined : value }))}
                            placeholder="Todos los proveedores"
                            searchPlaceholder="Buscar proveedor..."
                            options={[
                                { value: "all", label: "Todos los proveedores" },
                                ...suppliers.map(supplier => ({ value: supplier.id, label: supplier.name }))
                            ]}
                            maxVisible={4}
                            searchMessage="busca para encontrar más"
                            showLabel={true}
                            label="Proveedor"
                        />

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
                                placeholder="OT-1234..."
                                value={filters.workOrder || ''}
                                onChange={(e) => setFilters(prev => ({ ...prev, workOrder: e.target.value || undefined }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Ordenar por</Label>
                            <div className="flex gap-2">
                                <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'quantity' | 'cost' | 'name')}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cost">Coste Total</SelectItem>
                                        <SelectItem value="quantity">Cantidad Total</SelectItem>
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
                </CardContent>
            </Card>

            {/* Charts - All displayed directly without tabs */}
            <div className="space-y-6">


                {/* Top Materials and Suppliers Charts */}
                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Top 10 Materiales por Coste</CardTitle>
                            <CardDescription>
                                <Link href="/materiales" className="text-blue-600 hover:underline">
                                    Ver análisis completo de materiales →
                                </Link>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topMaterialsChart}>
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
                                        formatter={(value: number) => [formatCurrency(value), 'Coste']}
                                        labelFormatter={(label, payload) => {
                                            const first = Array.isArray(payload) ? payload[0] : undefined;
                                            const entry = (first && 'payload' in first) ? (first as { payload: { fullName?: string } }).payload : undefined;
                                            return entry?.fullName || String(label)
                                        }}
                                    />
                                    <Bar dataKey="cost" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Top 10 Proveedores por Gasto</CardTitle>
                            <CardDescription>
                                <Link href="/proveedores" className="text-blue-600 hover:underline">
                                    Ver análisis completo de proveedores →
                                </Link>
                            </CardDescription>
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
                                        labelFormatter={(label, payload) => {
                                            const first = Array.isArray(payload) ? payload[0] : undefined;
                                            const entry = (first && 'payload' in first) ? (first as { payload: { fullName?: string } }).payload : undefined;
                                            return entry?.fullName || String(label)
                                        }}
                                    />
                                    <Bar dataKey="spent" fill="#82ca9d" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Combined Chart: Materials by Quantity vs Cost */}
                <Card>
                    <CardHeader>
                        <CardTitle>Materiales por Cantidad vs Coste</CardTitle>
                        <CardDescription>
                            Comparación de cantidad y coste por material
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={topMaterialsChart}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="name"
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                    tick={{ fontSize: 10 }}
                                />
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    tickFormatter={(value) => formatCurrency(value)}
                                    tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{ fontSize: 11 }}
                                />
                                <Tooltip
                                    labelFormatter={(label, payload) => {
                                        const first = Array.isArray(payload) ? payload[0] : undefined;
                                        const entry = (first && 'payload' in first) ? (first as { payload: { fullName?: string } }).payload : undefined;
                                        return entry?.fullName || String(label)
                                    }}
                                />
                                <Legend />
                                <Bar yAxisId="left" dataKey="cost" fill="#8884d8" name="Coste" />
                                <Bar yAxisId="right" dataKey="quantity" fill="#82ca9d" name="Cantidad" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Monthly Evolution Chart */}
                {monthlyEvolutionData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Evolución Mensual del Gasto</CardTitle>
                            <CardDescription>
                                Tendencia de gastos por mes {hasActiveFilters && '(filtrado)'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={monthlyEvolutionData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="formattedMonth"
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis
                                        tickFormatter={(value) => formatCurrency(value)}
                                        tick={{ fontSize: 11 }}
                                    />
                                    <Tooltip
                                        formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                                        labelFormatter={(label) => `Mes: ${label}`}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="totalSpent"
                                        stroke="#8884d8"
                                        strokeWidth={2}
                                        dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}


            </div>
        </div>
    )
} 