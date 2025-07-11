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
    pagination?: {
        currentPage: number
        totalPages: number
        pageSize: number
        totalCount: number
    }
}

export function MaterialAnalyticsSection({
    materialAnalytics,
    suppliers,
    categories,
    workOrders,
    pagination
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

    // Use server-side pagination data or fall back to client-side for backward compatibility
    const currentPage = pagination?.currentPage || parseInt(searchParams.get('page') || '1', 10)
    const totalPages = pagination?.totalPages || Math.ceil(materialAnalytics.length / 20)
    const itemsPerPage = pagination?.pageSize || 20
    const totalItems = pagination?.totalCount || materialAnalytics.length

    // For server-side pagination, materials are already filtered and paginated
    // For client-side (backward compatibility), apply filtering and pagination
    const displayMaterials = pagination ? materialAnalytics : materialAnalytics
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
        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    // Prepare chart data from display materials
    const topMaterialsChart = displayMaterials.slice(0, 10).map(material => ({
        name: material.materialName.length > 15 ? material.materialName.substring(0, 15) + '...' : material.materialName,
        fullName: material.materialName,
        cost: material.totalCost,
        quantity: material.totalQuantity,
        avgUnitPrice: material.averageUnitPrice
    }))

    // Prepare quantity chart data (sorted by quantity)
    const topQuantityChart = [...displayMaterials]
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
                            {totalItems} de {materialAnalytics.length} materiales
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
                            {displayMaterials.map((material) => (
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