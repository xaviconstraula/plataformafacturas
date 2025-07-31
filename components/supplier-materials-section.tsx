'use client'

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import Link from "next/link"
import { DollarSign, Package, Users, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react"

function PaginationControls({
    currentPage,
    totalPages,
    paramPrefix
}: {
    currentPage: number
    totalPages: number
    paramPrefix: string
}) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const createPageURL = (page: number) => {
        const params = new URLSearchParams(searchParams)
        params.set(`${paramPrefix}Page`, page.toString())
        return `?${params.toString()}`
    }

    if (totalPages <= 1) return null

    return (
        <div className="flex items-center justify-between px-2">
            <div className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(createPageURL(currentPage - 1))}
                    disabled={currentPage <= 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(createPageURL(currentPage + 1))}
                    disabled={currentPage >= totalPages}
                >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

interface MaterialData {
    materialId: string
    materialName: string
    materialCode: string
    category?: string
    totalCost: number
    totalQuantity: number
    averageUnitPrice: number
    supplierCount: number
    lastPurchaseDate: Date
    workOrders: string[]
    topSuppliers: {
        supplierId: string
        supplierName: string
        totalCost: number
        totalQuantity: number
    }[]
}

interface PaginationInfo {
    currentPage: number
    totalPages: number
    pageSize: number
}

interface SupplierMaterialsSectionProps {
    materials: MaterialData[]
    totalMaterials: number
    totalCost: number
    totalQuantity: number
    totalSuppliers: number
    avgUnitPrice: number
    pagination?: PaginationInfo
    showAll?: boolean
}

export function SupplierMaterialsSection({
    materials,
    totalMaterials,
    totalCost,
    totalQuantity,
    totalSuppliers,
    avgUnitPrice,
    pagination,
    showAll = false
}: SupplierMaterialsSectionProps) {
    const [showMore, setShowMore] = useState(false)

    // Use server-side pagination if available, otherwise client-side for backwards compatibility
    const visibleMaterials = pagination
        ? materials // Server-side pagination: show all items from server
        : materials.slice(0, showAll ? materials.length : (showMore ? 20 : 10)) // Client-side fallback

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Total Materiales</div>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalMaterials}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Coste Total</div>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{formatCurrency(totalCost)}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Cantidad Total</div>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalQuantity.toFixed(2)}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Precio Promedio</div>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{formatCurrency(avgUnitPrice)}</div>
                </div>
            </div>

            {/* Materials Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Principales Materiales</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Mostrando {visibleMaterials.length} de {totalMaterials} materiales
                            </p>
                        </div>
                        {materials.length > 10 && !showAll && (
                            <Link href="/materiales">
                                <Button variant="outline" size="sm">
                                    Ver Todos los Materiales
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {visibleMaterials.length > 0 ? (
                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Material</TableHead>
                                        <TableHead>Categoría</TableHead>
                                        <TableHead>Coste Total</TableHead>
                                        <TableHead>Cantidad</TableHead>
                                        <TableHead>Precio Promedio</TableHead>
                                        <TableHead>Proveedores</TableHead>
                                        <TableHead>OT</TableHead>
                                        <TableHead>Última Compra</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleMaterials.map((material) => (
                                        <TableRow key={material.materialId}>
                                            <TableCell>
                                                <div>
                                                    <Link
                                                        href={`/materiales/${material.materialId}`}
                                                        className="font-medium hover:underline"
                                                    >
                                                        {material.materialName}
                                                    </Link>
                                                    {material.materialCode && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {material.materialCode}
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {material.category && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {material.category}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                {formatCurrency(material.totalCost)}
                                            </TableCell>
                                            <TableCell>{material.totalQuantity.toFixed(2)}</TableCell>
                                            <TableCell>{formatCurrency(material.averageUnitPrice)}</TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    {material.topSuppliers.slice(0, 2).map(supplier => (
                                                        <Badge key={supplier.supplierId} variant="secondary" className="text-xs">
                                                            {supplier.supplierName}
                                                        </Badge>
                                                    ))}
                                                    {material.topSuppliers.length > 2 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            +{material.topSuppliers.length - 2} más
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    {material.workOrders.slice(0, 2).map(wo => (
                                                        <Badge key={wo} variant="outline" className="text-xs">
                                                            {wo}
                                                        </Badge>
                                                    ))}
                                                    {material.workOrders.length > 2 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{material.workOrders.length - 2} más
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {material.lastPurchaseDate.toLocaleDateString('es-ES')}
                                            </TableCell>
                                            <TableCell>
                                                <Button size="sm" variant="outline" asChild>
                                                    <Link href={`/materiales/${material.materialId}`}>
                                                        Ver Detalle
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {/* Pagination Controls */}
                            {pagination ? (
                                <PaginationControls
                                    currentPage={pagination.currentPage}
                                    totalPages={pagination.totalPages}
                                    paramPrefix="materials"
                                />
                            ) : (
                                /* Show More Button for client-side pagination */
                                materials.length > visibleMaterials.length && !showAll && (
                                    <div className="flex justify-center">
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowMore(!showMore)}
                                        >
                                            {showMore ? 'Ver Menos' : `Ver Más (${materials.length - visibleMaterials.length} restantes)`}
                                        </Button>
                                    </div>
                                )
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No se encontraron materiales
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}