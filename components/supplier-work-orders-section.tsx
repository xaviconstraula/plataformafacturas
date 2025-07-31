'use client'

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatDate } from "@/lib/utils"
import Link from "next/link"
import { PackageIcon, DollarSignIcon, CalendarIcon, TruckIcon, ChevronLeft, ChevronRight } from "lucide-react"

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

interface WorkOrderData {
    workOrder: string
    totalCost: number
    totalQuantity: number
    itemCount: number
    providers: string[]
    materials: string[]
    dateRange: {
        earliest: Date
        latest: Date
    }
}

interface PaginationInfo {
    currentPage: number
    totalPages: number
    pageSize: number
}

interface SupplierWorkOrdersSectionProps {
    workOrders: WorkOrderData[]
    totalWorkOrders: number
    totalCost: number
    totalItems: number
    pagination?: PaginationInfo
    showAll?: boolean
}

export function SupplierWorkOrdersSection({
    workOrders,
    totalWorkOrders,
    totalCost,
    totalItems,
    pagination,
    showAll = false
}: SupplierWorkOrdersSectionProps) {
    const [showMore, setShowMore] = useState(false)

    // Use server-side pagination if available, otherwise client-side for backwards compatibility
    const visibleWorkOrders = pagination
        ? workOrders // Server-side pagination: show all items from server
        : workOrders.slice(0, showAll ? workOrders.length : (showMore ? 20 : 10)) // Client-side fallback

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Total OT</div>
                        <PackageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalWorkOrders}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Coste Total (c/IVA)</div>
                        <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{formatCurrency(totalCost)}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Total Materiales</div>
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalItems}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Coste Promedio (c/IVA)</div>
                        <TruckIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">
                        {formatCurrency(totalWorkOrders > 0 ? totalCost / totalWorkOrders : 0)}
                    </div>
                </div>
            </div>

            {/* Work Orders Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Órdenes de Trabajo Principales</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Mostrando {visibleWorkOrders.length} de {totalWorkOrders} órdenes de trabajo
                            </p>
                        </div>
                        {workOrders.length > 10 && !showAll && (
                            <Link href="/ordenes-trabajo">
                                <Button variant="outline" size="sm">
                                    Ver Todas las OT
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {visibleWorkOrders.length > 0 ? (
                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código OT</TableHead>
                                        <TableHead>Coste Total (c/IVA)</TableHead>
                                        <TableHead>Materiales</TableHead>
                                        <TableHead>Proveedores</TableHead>
                                        <TableHead>Principales Materiales</TableHead>
                                        <TableHead>Periodo</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleWorkOrders.map((workOrder) => (
                                        <TableRow key={workOrder.workOrder}>
                                            <TableCell className="font-medium">
                                                <Badge variant="outline">{workOrder.workOrder}</Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                {formatCurrency(workOrder.totalCost)}
                                            </TableCell>
                                            <TableCell>{workOrder.itemCount}</TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    {workOrder.providers.slice(0, 2).map(provider => (
                                                        <Badge key={provider} variant="secondary" className="text-xs">
                                                            {provider}
                                                        </Badge>
                                                    ))}
                                                    {workOrder.providers.length > 2 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            +{workOrder.providers.length - 2} más
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    {workOrder.materials.slice(0, 2).map(material => (
                                                        <Badge key={material} variant="outline" className="text-xs">
                                                            {material.length > 20 ? material.substring(0, 20) + '...' : material}
                                                        </Badge>
                                                    ))}
                                                    {workOrder.materials.length > 2 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{workOrder.materials.length - 2} más
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    <div>{formatDate(workOrder.dateRange.earliest)}</div>
                                                    {workOrder.dateRange.earliest.getTime() !== workOrder.dateRange.latest.getTime() && (
                                                        <div className="text-muted-foreground">
                                                            hasta {formatDate(workOrder.dateRange.latest)}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Button size="sm" variant="outline" asChild>
                                                    <Link href={`/ordenes-trabajo/${encodeURIComponent(workOrder.workOrder)}`}>
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
                                    paramPrefix="workOrders"
                                />
                            ) : (
                                /* Show More Button for client-side pagination */
                                workOrders.length > visibleWorkOrders.length && !showAll && (
                                    <div className="flex justify-center">
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowMore(!showMore)}
                                        >
                                            {showMore ? 'Ver Menos' : `Ver Más (${workOrders.length - visibleWorkOrders.length} restantes)`}
                                        </Button>
                                    </div>
                                )
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No se encontraron órdenes de trabajo
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}