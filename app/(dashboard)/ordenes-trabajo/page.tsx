import { Suspense } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowUpDownIcon, PackageIcon, DollarSignIcon, CalendarIcon, TruckIcon } from "lucide-react"
import { formatCurrency, formatDate, normalizeSearch } from "@/lib/utils"
import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma"
import { WorkOrderFilters } from "@/components/work-order-filters"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { Pagination } from "@/components/pagination"
import { ExcelExportButton } from "@/components/excel-export-button"

interface SearchParams {
    sortBy?: string
    sortOrder?: string
    search?: string
    provider?: string
    page?: string
}

interface PageProps {
    searchParams: Promise<SearchParams>
}

async function getWorkOrdersData(params: SearchParams) {
    const {
        sortBy = 'totalCost',
        sortOrder = 'desc',
        search,
        provider,
        page = '1'
    } = params

    const currentPage = parseInt(page, 10)
    const pageSize = 50 // Generous page size for performance
    const skip = (currentPage - 1) * pageSize

    // Normalize search term for consistent filtering
    const normalizedSearch = normalizeSearch(search)

    // Build where clause for filtering
    const baseWhere: Prisma.InvoiceItemWhereInput = {
        workOrder: {
            not: null,
            ...(normalizedSearch && { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive })
        },
        ...(provider && provider !== 'all' && {
            invoice: {
                providerId: provider
            }
        })
    }

    // First, get work order aggregations for pagination and sorting
    // Note: This aggregation now respects the provider filter in baseWhere
    const workOrderAggregation = await prisma.invoiceItem.groupBy({
        by: ['workOrder'],
        where: baseWhere,
        _sum: {
            totalPrice: true,
            quantity: true
        },
        _count: {
            id: true
        },
        _min: {
            itemDate: true
        },
        _max: {
            itemDate: true
        },
        orderBy: sortBy === 'totalCost' ? { _sum: { totalPrice: sortOrder as 'asc' | 'desc' } }
            : sortBy === 'totalQuantity' ? { _sum: { quantity: sortOrder as 'asc' | 'desc' } }
                : sortBy === 'itemCount' ? { _count: { id: sortOrder as 'asc' | 'desc' } }
                    : sortBy === 'workOrder' ? { workOrder: sortOrder as 'asc' | 'desc' }
                        : { _sum: { totalPrice: sortOrder as 'asc' | 'desc' } }
    })

    // Get total count for pagination
    const totalCount = workOrderAggregation.length
    const totalPages = Math.ceil(totalCount / pageSize)

    // Apply pagination to the aggregated results
    const paginatedWorkOrders = workOrderAggregation.slice(skip, skip + pageSize)

    if (paginatedWorkOrders.length === 0) {
        const providers = await prisma.provider.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 2000 // Optimized limit for thousands of providers
        })

        return {
            workOrders: [],
            providers,
            pagination: {
                currentPage,
                totalPages,
                pageSize,
                totalCount
            },
            totalWorkOrders: totalCount,
            totalCost: 0,
            totalItems: 0
        }
    }

    // Get the work order codes for the current page
    const workOrderCodes = paginatedWorkOrders.map(wo => wo.workOrder!).filter(Boolean)

    // Get ALL invoice items for the work orders in the current page in a single query
    const allItems = await prisma.invoiceItem.findMany({
        where: {
            ...baseWhere,
            workOrder: { in: workOrderCodes }
        },
        include: {
            material: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    category: true
                }
            },
            invoice: {
                select: {
                    id: true,
                    provider: {
                        select: {
                            id: true,
                            name: true,
                            cif: true
                        }
                    }
                }
            }
        },
        orderBy: {
            totalPrice: 'desc'
        }
    })

    // Group items by work order
    const itemsByWorkOrder = new Map<string, typeof allItems>()
    for (const item of allItems) {
        const workOrder = item.workOrder!
        if (!itemsByWorkOrder.has(workOrder)) {
            itemsByWorkOrder.set(workOrder, [])
        }
        itemsByWorkOrder.get(workOrder)!.push(item)
    }

    // Build the final work orders data structure
    const workOrdersWithDetails = paginatedWorkOrders.map(wo => {
        const workOrderCode = wo.workOrder!
        const items = itemsByWorkOrder.get(workOrderCode) || []

        // These are already filtered by the baseWhere clause, so they respect the provider filter
        const uniqueProviders = [...new Set(items.map(item => item.invoice.provider.name))]
        const uniqueMaterials = [...new Set(items.map(item => item.material.name))]

        const dateRange = {
            earliest: wo._min?.itemDate || new Date(),
            latest: wo._max?.itemDate || new Date()
        }

        return {
            workOrder: workOrderCode,
            totalCost: (wo._sum?.totalPrice?.toNumber() || 0) * 1.21, // Add 21% IVA - now filtered by provider
            totalQuantity: wo._sum?.quantity?.toNumber() || 0,
            itemCount: wo._count?.id || 0,
            providers: uniqueProviders,
            materials: uniqueMaterials,
            dateRange,
            items // Include items for detailed view
        }
    })

    // Get all providers for filter (limit for performance)
    const providers = await prisma.provider.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 2000 // Optimized limit for thousands of providers
    })

    // Calculate summary stats
    const totalCostSum = workOrderAggregation.reduce((sum, wo) => sum + (wo._sum?.totalPrice?.toNumber() || 0) * 1.21, 0)
    const totalItemsSum = workOrderAggregation.reduce((sum, wo) => sum + (wo._count?.id || 0), 0)

    return {
        workOrders: workOrdersWithDetails,
        providers,
        pagination: {
            currentPage,
            totalPages,
            pageSize,
            totalCount
        },
        totalWorkOrders: totalCount,
        totalCost: totalCostSum,
        totalItems: totalItemsSum
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
                <div className="flex items-center gap-2">
                    <ExcelExportButton
                        filters={{
                            workOrder: params.search || '', // Always pass workOrder even if empty to indicate this is work orders page
                            supplierId: params.provider && params.provider !== 'all' ? params.provider : undefined,
                            exportType: 'workorders-list' // Add type indicator
                        }}
                        includeDetails={true}
                        variant="outline"
                    >
                        Exportar Órdenes de Trabajo
                    </ExcelExportButton>
                    <HelpTooltip
                        title={helpContent.ordenesTrabajos.title}
                        description={helpContent.ordenesTrabajos.description}
                        content={helpContent.ordenesTrabajos.content}
                    />
                </div>
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
                        <div className="text-sm font-medium text-muted-foreground">Materiales </div>
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
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Lista de Órdenes de Trabajo</CardTitle>
                            <CardDescription>
                                Mostrando {((data.pagination.currentPage - 1) * data.pagination.pageSize) + 1} a{' '}
                                {Math.min(data.pagination.currentPage * data.pagination.pageSize, data.totalWorkOrders)} de{' '}
                                {data.totalWorkOrders} órdenes de trabajo
                            </CardDescription>
                        </div>
                        <ExcelExportButton
                            filters={{
                                workOrder: params.search || '',
                                supplierId: params.provider && params.provider !== 'all' ? params.provider : undefined,
                                exportType: 'workorders-list'
                            }}
                            includeDetails={true}
                            variant="outline"
                            size="sm"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
                        {data.workOrders.length > 0 ? (
                            <div className="space-y-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Código OT</TableHead>
                                            <TableHead>Coste Total (c/IVA)</TableHead>
                                            <TableHead>Materiales</TableHead>
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
                                                        <Link
                                                            href={{
                                                                pathname: `/ordenes-trabajo/${encodeURIComponent(workOrder.workOrder)}`,
                                                                query: {
                                                                    ...(params.search && { search: params.search }),
                                                                    ...(params.provider && params.provider !== 'all' && { provider: params.provider }),
                                                                    ...(params.sortBy && { sortBy: params.sortBy }),
                                                                    ...(params.sortOrder && { sortOrder: params.sortOrder })
                                                                }
                                                            }}
                                                        >
                                                            Ver Detalle
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                {/* Pagination */}
                                <Pagination
                                    currentPage={data.pagination.currentPage}
                                    totalPages={data.pagination.totalPages}
                                    itemsPerPage={data.pagination.pageSize}
                                    totalItems={data.totalWorkOrders}
                                />
                            </div>
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