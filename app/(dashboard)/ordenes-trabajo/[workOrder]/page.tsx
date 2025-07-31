import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon, PackageIcon, DollarSignIcon, CalendarIcon, TruckIcon, FileTextIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatDate, normalizeSearch } from "@/lib/utils"
import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma"
import type { InvoiceItem, Material, Invoice, Provider } from "@/generated/prisma"
import { GoBackButton } from "@/components/go-back-button"
import { ExcelExportButton } from "@/components/excel-export-button"
import { WorkOrderDetailFilters } from "@/components/work-order-detail-filters"
import { ProviderItemCard } from "@/components/provider-item-card"
import { MaterialItemCard } from "@/components/material-item-card"
import { Pagination } from "@/components/pagination"

type InvoiceItemWithDetails = InvoiceItem & {
    material: Material
    invoice: Invoice & {
        provider: Provider
    }
}

// Serialized types for client components (Decimal -> number)
type SerializedInvoice = Omit<Invoice, 'totalAmount'> & {
    totalAmount: number
    provider: Provider
}

type SerializedInvoiceItem = Omit<InvoiceItem, 'quantity' | 'unitPrice' | 'totalPrice'> & {
    quantity: number
    unitPrice: number
    totalPrice: number
    material: Material
    invoice: SerializedInvoice
}

type SerializedProviderGroup = {
    provider: Provider
    items: SerializedInvoiceItem[]
    totalCost: number
    totalQuantity: number
}

type SerializedMaterialGroup = {
    material: Material
    items: SerializedInvoiceItem[]
    totalCost: number
    totalQuantity: number
    uniqueProviders: string[] // Convert Set to Array for serialization
}

// Helper function to serialize invoice items
function serializeInvoiceItem(item: InvoiceItemWithDetails): SerializedInvoiceItem {
    return {
        ...item,
        quantity: item.quantity.toNumber(),
        unitPrice: item.unitPrice.toNumber(),
        totalPrice: item.totalPrice.toNumber(),
        invoice: {
            ...item.invoice,
            totalAmount: item.invoice.totalAmount.toNumber()
        }
    }
}

// Helper function to serialize provider groups
function serializeProviderGroups(groups: Array<{ provider: Provider, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number }>): SerializedProviderGroup[] {
    return groups.map(group => ({
        ...group,
        items: group.items.map(serializeInvoiceItem)
    }))
}

// Helper function to serialize material groups
function serializeMaterialGroups(groups: Array<{ material: Material, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number, uniqueProviders: Set<string> }>): SerializedMaterialGroup[] {
    return groups.map(group => ({
        ...group,
        items: group.items.map(serializeInvoiceItem),
        uniqueProviders: Array.from(group.uniqueProviders)
    }))
}

interface SearchParams {
    search?: string
    provider?: string
    material?: string
    sortBy?: string
    sortOrder?: string
    page?: string
}

interface PageProps {
    params: Promise<{ workOrder: string }>
    searchParams: Promise<SearchParams>
}

async function getWorkOrderDetails(workOrderCode: string, searchParams: SearchParams) {
    // Decode the work order code
    const decodedWorkOrder = decodeURIComponent(workOrderCode)

    const {
        search,
        provider,
        material,
        sortBy = 'itemDate',
        sortOrder = 'desc',
        page = '1'
    } = searchParams

    const currentPage = parseInt(page, 10)
    const pageSize = 50
    const skip = (currentPage - 1) * pageSize

    // Normalize search term for consistent filtering
    const normalizedSearch = normalizeSearch(search)

    // Build where clause for filtering
    const baseWhere: Prisma.InvoiceItemWhereInput = {
        workOrder: decodedWorkOrder,
        ...(normalizedSearch && {
            OR: [
                { material: { name: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive } } },
                { invoice: { provider: { name: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive } } } },
                { material: { code: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive } } }
            ]
        }),
        ...(provider && provider !== 'all' && {
            invoice: { providerId: provider }
        }),
        ...(material && material !== 'all' && {
            materialId: material
        })
    }

    // Get total count for pagination
    const totalCount = await prisma.invoiceItem.count({
        where: baseWhere
    })

    // Build order by clause
    let orderBy: Prisma.InvoiceItemOrderByWithRelationInput[]
    switch (sortBy) {
        case 'totalPrice':
            orderBy = [{ totalPrice: sortOrder as 'asc' | 'desc' }]
            break
        case 'quantity':
            orderBy = [{ quantity: sortOrder as 'asc' | 'desc' }]
            break
        case 'unitPrice':
            orderBy = [{ unitPrice: sortOrder as 'asc' | 'desc' }]
            break
        case 'material':
            orderBy = [{ material: { name: sortOrder as 'asc' | 'desc' } }]
            break
        case 'provider':
            orderBy = [{ invoice: { provider: { name: sortOrder as 'asc' | 'desc' } } }]
            break
        default:
            orderBy = [{ itemDate: sortOrder as 'asc' | 'desc' }, { totalPrice: 'desc' }]
    }

    const items = await prisma.invoiceItem.findMany({
        where: baseWhere,
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        },
        orderBy,
        skip,
        take: pageSize
    })

    if (totalCount === 0) {
        return null
    }

    // Get all items for summary calculations (without pagination)
    const allItems = await prisma.invoiceItem.findMany({
        where: {
            workOrder: decodedWorkOrder
        },
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        }
    })

    // Get unique providers and materials for filters
    const uniqueProviders = Array.from(
        new Map(allItems.map(item => [item.invoice.provider.id, item.invoice.provider])).values()
    ).sort((a, b) => a.name.localeCompare(b.name))

    const uniqueMaterials = Array.from(
        new Map(allItems.map(item => [item.material.id, item.material])).values()
    ).sort((a, b) => a.name.localeCompare(b.name))

    // Calculate summary statistics from all items
    const totalCostBeforeIva = allItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0)
    const totalCost = totalCostBeforeIva * 1.21 // Add 21% IVA
    const totalQuantity = allItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0)

    const dateRange = {
        earliest: allItems.reduce((min, item) => item.itemDate < min ? item.itemDate : min, allItems[0].itemDate),
        latest: allItems.reduce((max, item) => item.itemDate > max ? item.itemDate : max, allItems[0].itemDate)
    }

    // Calculate filtered summary statistics
    const filteredItems = await prisma.invoiceItem.findMany({
        where: baseWhere,
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        }
    })

    const filteredTotalCost = filteredItems.reduce((sum, item) => sum + item.totalPrice.toNumber() * 1.21, 0)
    const filteredTotalQuantity = filteredItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0)

    // Group by provider
    const byProvider = filteredItems.reduce((acc, item) => {
        const providerId = item.invoice.providerId
        if (!acc[providerId]) {
            acc[providerId] = {
                provider: item.invoice.provider,
                items: [],
                totalCost: 0,
                totalQuantity: 0
            }
        }
        acc[providerId].items.push(item)
        acc[providerId].totalCost += item.totalPrice.toNumber() * 1.21 // Add 21% IVA
        acc[providerId].totalQuantity += item.quantity.toNumber()
        return acc
    }, {} as Record<string, { provider: Provider, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number }>)

    // Group by material with enhanced data
    const byMaterial = filteredItems.reduce((acc, item) => {
        const materialId = item.materialId
        if (!acc[materialId]) {
            acc[materialId] = {
                material: item.material,
                items: [],
                totalCost: 0,
                totalQuantity: 0,
                uniqueProviders: new Set<string>()
            }
        }
        acc[materialId].items.push(item)
        acc[materialId].totalCost += item.totalPrice.toNumber() * 1.21 // Add 21% IVA
        acc[materialId].totalQuantity += item.quantity.toNumber()
        acc[materialId].uniqueProviders.add(item.invoice.provider.name)
        return acc
    }, {} as Record<string, { material: Material, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number, uniqueProviders: Set<string> }>)

    // Group by month
    const byMonth = filteredItems.reduce((acc, item) => {
        const monthKey = item.itemDate.toISOString().substring(0, 7) // YYYY-MM
        if (!acc[monthKey]) {
            acc[monthKey] = {
                month: monthKey,
                items: [],
                totalCost: 0,
                totalQuantity: 0
            }
        }
        acc[monthKey].items.push(item)
        acc[monthKey].totalCost += item.totalPrice.toNumber() * 1.21 // Add 21% IVA
        acc[monthKey].totalQuantity += item.quantity.toNumber()
        return acc
    }, {} as Record<string, { month: string, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number }>)

    const totalPages = Math.ceil(totalCount / pageSize)

    return {
        workOrder: decodedWorkOrder,
        items: items.map(serializeInvoiceItem),
        filteredItems: filteredItems.map(serializeInvoiceItem),
        allItems: allItems.map(serializeInvoiceItem),
        uniqueProviders,
        uniqueMaterials,
        summary: {
            totalCost,
            totalCostBeforeIva,
            totalQuantity,
            itemCount: allItems.length,
            providerCount: uniqueProviders.length,
            materialCount: uniqueMaterials.length,
            dateRange,
            // Filtered summary
            filteredTotalCost,
            filteredTotalQuantity,
            filteredItemCount: filteredItems.length
        },
        groupedData: {
            byProvider: serializeProviderGroups(Object.values(byProvider).sort((a, b) => b.totalCost - a.totalCost)),
            byMaterial: serializeMaterialGroups(Object.values(byMaterial).sort((a, b) => b.totalCost - a.totalCost)),
            byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
        },
        pagination: {
            currentPage,
            totalPages,
            pageSize,
            totalCount
        }
    }
}

export default async function WorkOrderDetailPage({ params, searchParams }: PageProps) {
    const { workOrder } = await params
    const searchParamsData = await searchParams
    const data = await getWorkOrderDetails(workOrder, searchParamsData)

    if (!data) {
        notFound()
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">OT: {workOrder}</h1>
                    <p className="text-muted-foreground">
                        Desglose detallado de materiales y costes
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ExcelExportButton filters={{ workOrder: data.workOrder }} includeDetails />
                    <GoBackButton
                        fallbackUrl={`/ordenes-trabajo?${new URLSearchParams({
                            ...(searchParamsData.search && { search: searchParamsData.search }),
                            ...(searchParamsData.provider && searchParamsData.provider !== 'all' && { provider: searchParamsData.provider }),
                            ...(searchParamsData.sortBy && { sortBy: searchParamsData.sortBy }),
                            ...(searchParamsData.sortOrder && { sortOrder: searchParamsData.sortOrder }),
                            ...(searchParamsData.page && { page: searchParamsData.page })
                        }).toString()}`}
                        label="Volver a Órdenes de Trabajo"
                        forceUrl={true}
                    />
                </div>
            </div>

            {/* Filters */}
            <WorkOrderDetailFilters
                providers={data.uniqueProviders}
                materials={data.uniqueMaterials}
                workOrder={data.workOrder}
            />

            {/* Work Order Summary */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Orden de Trabajo: {data.workOrder}</CardTitle>
                    <CardDescription>
                        Detalle completo de costes y materiales
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                        <div className="flex items-center gap-3">
                            <DollarSignIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Coste Total (c/IVA)</p>
                                <p className="text-2xl font-bold">{formatCurrency(data.summary.totalCost)}</p>
                                {data.summary.filteredTotalCost !== data.summary.totalCost && (
                                    <p className="text-xs text-muted-foreground">
                                        Filtrado: {formatCurrency(data.summary.filteredTotalCost)}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Items</p>
                                <p className="text-2xl font-bold">{data.summary.itemCount}</p>
                                {data.summary.filteredItemCount !== data.summary.itemCount && (
                                    <p className="text-xs text-muted-foreground">
                                        Filtrado: {data.summary.filteredItemCount}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <TruckIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Proveedores</p>
                                <p className="text-2xl font-bold">{data.summary.providerCount}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <PackageIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Materiales</p>
                                <p className="text-2xl font-bold">{data.summary.materialCount}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Periodo</p>
                                <p className="text-sm font-medium">{formatDate(data.summary.dateRange.earliest)}</p>
                                {data.summary.dateRange.earliest.getTime() !== data.summary.dateRange.latest.getTime() && (
                                    <p className="text-xs text-muted-foreground">hasta {formatDate(data.summary.dateRange.latest)}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* IVA Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle>Desglose de Costes</CardTitle>
                    <CardDescription>
                        Breakdown detallado de costes con IVA incluido
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-lg border p-4">
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-muted-foreground">Base Imponible:</span>
                                <span className="font-medium">{formatCurrency(data.summary.totalCostBeforeIva)}</span>
                            </div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-muted-foreground">IVA (21%):</span>
                                <span className="font-medium">{formatCurrency(data.summary.totalCostBeforeIva * 0.21)}</span>
                            </div>
                        </div>
                        <div className="rounded-lg border p-4 bg-primary/5">
                            <div className="flex justify-between">
                                <span className="text-sm font-bold">Total con IVA:</span>
                                <span className="font-bold text-lg">{formatCurrency(data.summary.totalCost)}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Analysis */}
            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Análisis Detallado</h2>
                    <p className="text-sm text-gray-600">Explora los datos de la orden de trabajo desde diferentes perspectivas</p>
                </div>
                <Tabs defaultValue="by-provider" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 h-12 p-1 bg-gray-100 rounded-lg border">
                        <TabsTrigger
                            value="by-provider"
                            className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm font-medium text-gray-700 hover:text-gray-900 transition-all"
                        >
                            Por Proveedor
                        </TabsTrigger>
                        <TabsTrigger
                            value="by-material"
                            className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm font-medium text-gray-700 hover:text-gray-900 transition-all"
                        >
                            Por Material
                        </TabsTrigger>
                        <TabsTrigger
                            value="by-month"
                            className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm font-medium text-gray-700 hover:text-gray-900 transition-all"
                        >
                            Por Mes
                        </TabsTrigger>
                        <TabsTrigger
                            value="all-items"
                            className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm font-medium text-gray-700 hover:text-gray-900 transition-all"
                        >
                            Items ({data.summary.filteredItemCount})
                        </TabsTrigger>
                    </TabsList>

                    <div className="mt-6">
                        <TabsContent value="by-provider">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Análisis por Proveedor</CardTitle>
                                    <CardDescription>
                                        Desglose de costes por proveedor para esta orden de trabajo
                                        {data.summary.filteredItemCount !== data.summary.itemCount && (
                                            <span className="text-muted-foreground">
                                                {' '}• Mostrando solo datos filtrados
                                            </span>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {data.groupedData.byProvider.map((group) => (
                                            <ProviderItemCard key={group.provider.id} group={group} />
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="all-items">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Items de la Orden de Trabajo</CardTitle>
                                    <CardDescription>
                                        Mostrando {((data.pagination.currentPage - 1) * data.pagination.pageSize) + 1} a{' '}
                                        {Math.min(data.pagination.currentPage * data.pagination.pageSize, data.pagination.totalCount)} de{' '}
                                        {data.pagination.totalCount} items
                                        {data.summary.filteredItemCount !== data.summary.itemCount && (
                                            <span className="text-muted-foreground">
                                                {' '}• {data.summary.filteredItemCount} después del filtrado
                                            </span>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Fecha</TableHead>
                                                    <TableHead>Material</TableHead>
                                                    <TableHead>Proveedor</TableHead>
                                                    <TableHead>Cantidad</TableHead>
                                                    <TableHead>Precio Unit.</TableHead>
                                                    <TableHead>Total (c/IVA)</TableHead>
                                                    <TableHead>Factura</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{formatDate(item.itemDate)}</TableCell>
                                                        <TableCell className="font-medium">
                                                            <div>
                                                                <div className="font-medium">{item.material.name}</div>
                                                                {item.material.code && (
                                                                    <div className="text-xs text-muted-foreground">{item.material.code}</div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{item.invoice.provider.name}</TableCell>
                                                        <TableCell>{item.quantity.toLocaleString()}</TableCell>
                                                        <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                                                        <TableCell className="font-semibold">{formatCurrency(item.totalPrice * 1.21)}</TableCell>
                                                        <TableCell>
                                                            <Link
                                                                href={`/facturas/${item.invoice.id}`}
                                                                className="text-blue-600 hover:underline text-sm"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                {item.invoice.invoiceCode}
                                                            </Link>
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
                                            totalItems={data.pagination.totalCount}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="by-material">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Análisis por Material</CardTitle>
                                    <CardDescription>
                                        Desglose de costes por material para esta orden de trabajo
                                        {data.summary.filteredItemCount !== data.summary.itemCount && (
                                            <span className="text-muted-foreground">
                                                {' '}• Mostrando solo datos filtrados
                                            </span>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {data.groupedData.byMaterial.map((group) => (
                                            <MaterialItemCard key={group.material.id} group={group} />
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="by-month">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Análisis por Mes</CardTitle>
                                    <CardDescription>
                                        Evolución temporal de los costes de esta orden de trabajo
                                        {data.summary.filteredItemCount !== data.summary.itemCount && (
                                            <span className="text-muted-foreground">
                                                {' '}• Mostrando solo datos filtrados
                                            </span>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {data.groupedData.byMonth.map((group) => (
                                            <Card key={group.month}>
                                                <CardHeader className="pb-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <CardTitle className="text-lg">
                                                                {new Date(group.month + '-01').toLocaleDateString('es-ES', {
                                                                    year: 'numeric',
                                                                    month: 'long'
                                                                })}
                                                            </CardTitle>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-2xl font-bold">{formatCurrency(group.totalCost)}</div>
                                                            <div className="text-sm text-muted-foreground">{group.items.length} items</div>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Material</TableHead>
                                                                <TableHead>Proveedor</TableHead>
                                                                <TableHead>Fecha</TableHead>
                                                                <TableHead>Cantidad</TableHead>
                                                                <TableHead>Total (c/IVA)</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {group.items.slice(0, 10).map((item) => (
                                                                <TableRow key={item.id}>
                                                                    <TableCell className="font-medium">{item.material.name}</TableCell>
                                                                    <TableCell>{item.invoice.provider.name}</TableCell>
                                                                    <TableCell>{formatDate(item.itemDate)}</TableCell>
                                                                    <TableCell>{item.quantity.toNumber().toLocaleString()}</TableCell>
                                                                    <TableCell className="font-semibold">{formatCurrency(item.totalPrice.toNumber() * 1.21)}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                    {group.items.length > 10 && (
                                                        <div className="mt-2 text-center text-sm text-muted-foreground">
                                                            Mostrando 10 de {group.items.length} items. Usa los filtros para ver más detalles.
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    )
} 