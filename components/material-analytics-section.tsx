'use client'

import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from "@/lib/utils"
import { MaterialAnalytics } from "@/lib/actions/analytics"
import { ProviderType } from "@/generated/prisma"
import Link from "next/link"
import { ArrowUpRight, PencilIcon, TrashIcon, X } from "lucide-react"
import { EditMaterialDialog } from "./edit-material-dialog"
import { DeleteMaterialDialog } from "./delete-material-dialog"
import { Pagination } from "./pagination"

interface MaterialAnalyticsSectionProps {
    materialAnalytics: MaterialAnalytics[]
    suppliers: Array<{ id: string; name: string; type: ProviderType }>
    categories: string[]
    workOrders: string[]
}

export function MaterialAnalyticsSection({
    materialAnalytics,
    suppliers,
    categories,
    workOrders
}: MaterialAnalyticsSectionProps) {
    const searchParams = useSearchParams()

    // Get filters from URL params
    const filters = {
        materialSearch: searchParams.get('materialSearch') || '',
        category: searchParams.get('category') || '',
        workOrder: searchParams.get('workOrder') || '',
        supplierId: searchParams.get('supplierId') || '',
        minUnitPrice: searchParams.get('minUnitPrice') ? parseFloat(searchParams.get('minUnitPrice')!) : undefined,
        maxUnitPrice: searchParams.get('maxUnitPrice') ? parseFloat(searchParams.get('maxUnitPrice')!) : undefined,
        minTotalCost: searchParams.get('minTotalCost') ? parseFloat(searchParams.get('minTotalCost')!) : undefined,
        maxTotalCost: searchParams.get('maxTotalCost') ? parseFloat(searchParams.get('maxTotalCost')!) : undefined,
        minQuantity: searchParams.get('minQuantity') ? parseFloat(searchParams.get('minQuantity')!) : undefined,
        maxQuantity: searchParams.get('maxQuantity') ? parseFloat(searchParams.get('maxQuantity')!) : undefined,
        startDate: searchParams.get('startDate') || '',
        endDate: searchParams.get('endDate') || ''
    }

    const sortBy = (searchParams.get('sortBy') || 'cost') as 'quantity' | 'cost' | 'name' | 'avgUnitPrice'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Pagination params
    const currentPage = parseInt(searchParams.get('page') || '1', 10)
    const itemsPerPage = 20

    // Apply filters and sorting to material analytics
    const filteredMaterials = materialAnalytics
        .filter(material => {
            // Basic filters
            if (filters.materialSearch && !material.materialName.toLowerCase().includes(filters.materialSearch.toLowerCase()) &&
                !material.materialCode?.toLowerCase().includes(filters.materialSearch.toLowerCase())) return false

            if (filters.category && filters.category !== 'all' && !material.category?.toLowerCase().includes(filters.category.toLowerCase())) return false

            if (filters.supplierId && filters.supplierId !== 'all' && !material.topSuppliers.some(s => s.supplierId === filters.supplierId)) return false

            if (filters.workOrder && !material.workOrders.some(wo => wo.toLowerCase().includes(filters.workOrder!.toLowerCase()))) return false

            // Advanced filters
            if (filters.minUnitPrice !== undefined && material.averageUnitPrice < filters.minUnitPrice) return false
            if (filters.maxUnitPrice !== undefined && material.averageUnitPrice > filters.maxUnitPrice) return false

            if (filters.minTotalCost !== undefined && material.totalCost < filters.minTotalCost) return false
            if (filters.maxTotalCost !== undefined && material.totalCost > filters.maxTotalCost) return false

            if (filters.minQuantity !== undefined && material.totalQuantity < filters.minQuantity) return false
            if (filters.maxQuantity !== undefined && material.totalQuantity > filters.maxQuantity) return false

            // Date filters (if we have lastPurchaseDate in the analytics)
            if (filters.startDate && material.lastPurchaseDate) {
                const materialDate = new Date(material.lastPurchaseDate)
                const startDate = new Date(filters.startDate)
                if (materialDate < startDate) return false
            }

            if (filters.endDate && material.lastPurchaseDate) {
                const materialDate = new Date(material.lastPurchaseDate)
                const endDate = new Date(filters.endDate)
                if (materialDate > endDate) return false
            }

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
                case 'avgUnitPrice':
                    aValue = a.averageUnitPrice
                    bValue = b.averageUnitPrice
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

    // Pagination logic
    const totalItems = filteredMaterials.length
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedMaterials = filteredMaterials.slice(startIndex, endIndex)

    // Prepare chart data
    const topMaterialsChart = filteredMaterials.slice(0, 10).map(material => ({
        name: material.materialName.length > 15 ? material.materialName.substring(0, 15) + '...' : material.materialName,
        fullName: material.materialName,
        cost: material.totalCost,
        quantity: material.totalQuantity,
        avgUnitPrice: material.averageUnitPrice
    }))

    // Prepare quantity chart data (sorted by quantity)
    const topQuantityChart = [...filteredMaterials]
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 10)
        .map(material => ({
            name: material.materialName.length > 15 ? material.materialName.substring(0, 15) + '...' : material.materialName,
            fullName: material.materialName,
            cost: material.totalCost,
            quantity: material.totalQuantity,
            avgUnitPrice: material.averageUnitPrice
        }))

    const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== '' && value !== 'all')

    return (
        <div className="space-y-6">
            {/* Results Summary */}
            {hasActiveFilters && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                            {filteredMaterials.length} de {materialAnalytics.length} materiales
                        </Badge>
                        {hasActiveFilters && (
                            <Badge variant="outline">
                                Filtros aplicados
                            </Badge>
                        )}
                    </div>
                </div>
            )}

            {/* Dedicated Quantity Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Top 10 Materiales por Cantidad Total Comprada
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={topQuantityChart}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 10 }}
                            />
                            <YAxis
                                tickFormatter={(value) => value.toString()}
                                tick={{ fontSize: 11 }}
                            />
                            <Tooltip
                                formatter={(value: number) => [value.toString(), 'Cantidad Total']}
                                labelFormatter={(label: string, payload: Array<{ payload?: { fullName?: string } }>) => {
                                    const entry = payload?.[0]?.payload
                                    return entry?.fullName || label
                                }}
                            />
                            <Bar
                                dataKey="quantity"
                                fill="#10b981"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Dynamic Chart - Original */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Top 10 Materiales por {sortBy === 'cost' ? 'Coste' : sortBy === 'quantity' ? 'Cantidad' : 'Precio Promedio'}
                    </CardTitle>
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
                                tickFormatter={(value) =>
                                    sortBy === 'quantity' ? value.toString() : formatCurrency(value)
                                }
                                tick={{ fontSize: 11 }}
                            />
                            <Tooltip
                                formatter={(value: number, name: string) => {
                                    if (name === 'cost') return [formatCurrency(value), 'Coste Total']
                                    if (name === 'quantity') return [value.toString(), 'Cantidad Total']
                                    if (name === 'avgUnitPrice') return [formatCurrency(value), 'Precio Promedio']
                                    return [value, name]
                                }}
                                labelFormatter={(label: string, payload: Array<{ payload?: { fullName?: string } }>) => {
                                    const entry = payload?.[0]?.payload
                                    return entry?.fullName || label
                                }}
                            />
                            <Bar
                                dataKey={sortBy === 'quantity' ? 'quantity' : sortBy === 'avgUnitPrice' ? 'avgUnitPrice' : 'cost'}
                                fill="#8884d8"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>



            {/* Analytics Table */}
            <Card className="py-8">
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">Cantidad Total</TableHead>
                                <TableHead className="text-right">Coste Total</TableHead>
                                <TableHead className="text-right">Precio Promedio</TableHead>
                                <TableHead className="text-right">Proveedores</TableHead>
                                <TableHead className="w-[100px]">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedMaterials.map((material) => (
                                <TableRow key={material.materialId}>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <Link
                                                href={`/materiales/${material.materialId}`}
                                                className="font-medium hover:underline flex items-center gap-1"
                                            >
                                                {material.materialName}
                                                <ArrowUpRight className="h-3 w-3" />
                                            </Link>
                                            {material.workOrders.length > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    {material.workOrders.join(', ')}
                                                </div>
                                            )}
                                            {material.category && (
                                                <Badge variant="outline" className="text-xs">
                                                    {material.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-right">
                                        {material.totalQuantity}
                                        {material.unit && (
                                            <span className="text-xs text-muted-foreground ml-1">
                                                {material.unit}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">{formatCurrency(material.totalCost)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(material.averageUnitPrice)}</TableCell>
                                    <TableCell className="text-center">{material.supplierCount}</TableCell>
                                    <TableCell className="">
                                        <EditMaterialDialog materialId={material.materialId}>
                                            <Button variant="ghost" size="icon" aria-label="Editar material">
                                                <PencilIcon className="h-4 w-4" />
                                            </Button>
                                        </EditMaterialDialog>
                                        <DeleteMaterialDialog materialId={material.materialId} materialName={material.materialName}>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Eliminar material">
                                                <TrashIcon className="h-4 w-4" />
                                            </Button>
                                        </DeleteMaterialDialog>
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