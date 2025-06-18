import { Suspense } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowUpDownIcon, PackageIcon, DollarSignIcon, CalendarIcon, TruckIcon } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { prisma } from "@/lib/db"
import { WorkOrderFilters } from "@/components/work-order-filters"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"

interface SearchParams {
    sortBy?: string
    sortOrder?: string
    search?: string
    provider?: string
}

interface PageProps {
    searchParams: Promise<SearchParams>
}

async function getWorkOrdersData(params: SearchParams) {
    const { sortBy = 'totalCost', sortOrder = 'desc', search, provider } = params

    // Get all work orders with their details
    const workOrdersRaw = await prisma.invoiceItem.groupBy({
        by: ['workOrder'],
        where: {
            workOrder: {
                not: null,
                ...(search && { contains: search, mode: 'insensitive' })
            },
            ...(provider && provider !== 'all' && {
                invoice: {
                    providerId: provider
                }
            })
        },
        _sum: {
            totalPrice: true,
            quantity: true
        },
        _count: {
            _all: true
        }
    })

    // Get detailed data for each work order
    const workOrdersWithDetails = await Promise.all(
        workOrdersRaw.map(async (wo) => {
            const items = await prisma.invoiceItem.findMany({
                where: { workOrder: wo.workOrder! },
                include: {
                    material: true,
                    invoice: {
                        include: {
                            provider: true
                        }
                    }
                },
                orderBy: {
                    totalPrice: 'desc'
                }
            })

            const uniqueProviders = [...new Set(items.map(item => item.invoice.provider.name))]
            const uniqueMaterials = [...new Set(items.map(item => item.material.name))]
            const dateRange = {
                earliest: items.reduce((min, item) => item.itemDate < min ? item.itemDate : min, items[0]?.itemDate || new Date()),
                latest: items.reduce((max, item) => item.itemDate > max ? item.itemDate : max, items[0]?.itemDate || new Date())
            }

            return {
                workOrder: wo.workOrder!,
                totalCost: (wo._sum.totalPrice?.toNumber() || 0) * 1.21, // Add 21% IVA
                totalQuantity: wo._sum.quantity?.toNumber() || 0,
                itemCount: wo._count._all,
                providers: uniqueProviders,
                materials: uniqueMaterials,
                dateRange,
                items
            }
        })
    )

    // Sort the work orders
    const sorted = workOrdersWithDetails.sort((a, b) => {
        let aValue: number | string, bValue: number | string

        switch (sortBy) {
            case 'totalCost':
                aValue = a.totalCost
                bValue = b.totalCost
                break
            case 'totalQuantity':
                aValue = a.totalQuantity
                bValue = b.totalQuantity
                break
            case 'itemCount':
                aValue = a.itemCount
                bValue = b.itemCount
                break
            case 'workOrder':
                aValue = a.workOrder
                bValue = b.workOrder
                break
            default:
                aValue = a.totalCost
                bValue = b.totalCost
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
        }

        return sortOrder === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
    })

    // Get all providers for filter
    const providers = await prisma.provider.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    })

    return {
        workOrders: sorted,
        providers,
        totalWorkOrders: sorted.length,
        totalCost: sorted.reduce((sum, wo) => sum + wo.totalCost, 0),
        totalItems: sorted.reduce((sum, wo) => sum + wo.itemCount, 0)
    }
}

export default async function WorkOrdersPage({ searchParams }: PageProps) {
    const params = await searchParams
    const data = await getWorkOrdersData(params)

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Órdenes de Trabajo</h1>
                    <p className="text-muted-foreground">
                        Análisis detallado de costes y materiales por OT/CECO
                    </p>
                </div>
                <HelpTooltip
                    title={helpContent.ordenesTrabajos.title}
                    description={helpContent.ordenesTrabajos.description}
                    content={helpContent.ordenesTrabajos.content}
                />
            </div>

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Total OT</div>
                        <PackageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{data.totalWorkOrders}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Coste Total (c/IVA)</div>
                        <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{formatCurrency(data.totalCost)}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Total Items</div>
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{data.totalItems}</div>
                </div>

                <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Coste Promedio (c/IVA)</div>
                        <TruckIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">
                        {formatCurrency(data.totalWorkOrders > 0 ? data.totalCost / data.totalWorkOrders : 0)}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <WorkOrderFilters providers={data.providers} />

            {/* Work Orders Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Lista de Órdenes de Trabajo</CardTitle>
                    <CardDescription>
                        {data.totalWorkOrders} órdenes de trabajo encontradas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
                        {data.workOrders.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código OT</TableHead>
                                        <TableHead>Coste Total (c/IVA)</TableHead>
                                        <TableHead>Items</TableHead>
                                        <TableHead>Proveedores</TableHead>
                                        <TableHead>Materiales</TableHead>
                                        <TableHead>Periodo</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.workOrders.map((workOrder) => (
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
                        ) : (
                            <div className="text-center text-muted-foreground py-8">
                                No se encontraron órdenes de trabajo
                            </div>
                        )}
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    )
} 