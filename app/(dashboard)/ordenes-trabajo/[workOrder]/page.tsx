import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon, PackageIcon, DollarSignIcon, CalendarIcon, TruckIcon, FileTextIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatDate } from "@/lib/utils"
import { prisma } from "@/lib/db"
import type { InvoiceItem, Material, Invoice, Provider } from "@/generated/prisma"

type InvoiceItemWithDetails = InvoiceItem & {
    material: Material
    invoice: Invoice & {
        provider: Provider
    }
}

interface PageProps {
    params: Promise<{ workOrder: string }>
}

async function getWorkOrderDetails(workOrderCode: string) {
    // Decode the work order code
    const decodedWorkOrder = decodeURIComponent(workOrderCode)

    const items = await prisma.invoiceItem.findMany({
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
        },
        orderBy: [
            { itemDate: 'desc' },
            { totalPrice: 'desc' }
        ]
    })

    if (items.length === 0) {
        return null
    }

    // Calculate summary statistics
    const totalCost = items.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0)
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity.toNumber(), 0)
    const uniqueProviders = [...new Set(items.map(item => item.invoice.provider.name))]
    const uniqueMaterials = [...new Set(items.map(item => item.material.name))]

    const dateRange = {
        earliest: items.reduce((min, item) => item.itemDate < min ? item.itemDate : min, items[0].itemDate),
        latest: items.reduce((max, item) => item.itemDate > max ? item.itemDate : max, items[0].itemDate)
    }

    // Group by provider
    const byProvider = items.reduce((acc, item) => {
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
        acc[providerId].totalCost += item.totalPrice.toNumber()
        acc[providerId].totalQuantity += item.quantity.toNumber()
        return acc
    }, {} as Record<string, { provider: Provider, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number }>)

    // Group by material
    const byMaterial = items.reduce((acc, item) => {
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
        acc[materialId].totalCost += item.totalPrice.toNumber()
        acc[materialId].totalQuantity += item.quantity.toNumber()
        acc[materialId].uniqueProviders.add(item.invoice.provider.name)
        return acc
    }, {} as Record<string, { material: Material, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number, uniqueProviders: Set<string> }>)

    // Group by month
    const byMonth = items.reduce((acc, item) => {
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
        acc[monthKey].totalCost += item.totalPrice.toNumber()
        acc[monthKey].totalQuantity += item.quantity.toNumber()
        return acc
    }, {} as Record<string, { month: string, items: InvoiceItemWithDetails[], totalCost: number, totalQuantity: number }>)

    return {
        workOrder: decodedWorkOrder,
        items,
        summary: {
            totalCost,
            totalQuantity,
            itemCount: items.length,
            providerCount: uniqueProviders.length,
            materialCount: uniqueMaterials.length,
            dateRange
        },
        groupedData: {
            byProvider: Object.values(byProvider).sort((a, b) => b.totalCost - a.totalCost),
            byMaterial: Object.values(byMaterial).sort((a, b) => b.totalCost - a.totalCost),
            byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
        }
    }
}

export default async function WorkOrderDetailPage({ params }: PageProps) {
    const { workOrder } = await params
    const data = await getWorkOrderDetails(workOrder)

    if (!data) {
        notFound()
    }

    return (
        <div className="flex flex-col gap-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/ordenes-trabajo">
                        <ArrowLeftIcon className="h-4 w-4 mr-2" />
                        Volver a OT
                    </Link>
                </Button>
            </div>

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
                                <p className="text-sm font-medium text-muted-foreground">Coste Total</p>
                                <p className="text-2xl font-bold">{formatCurrency(data.summary.totalCost)}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Items</p>
                                <p className="text-2xl font-bold">{data.summary.itemCount}</p>
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

            {/* Detailed Analysis */}
            <Tabs defaultValue="by-provider" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="by-provider">Por Proveedor</TabsTrigger>
                    <TabsTrigger value="by-material">Por Material</TabsTrigger>
                    <TabsTrigger value="by-month">Por Mes</TabsTrigger>
                    <TabsTrigger value="all-items">Todos los Items</TabsTrigger>
                </TabsList>

                <TabsContent value="by-provider">
                    <Card>
                        <CardHeader>
                            <CardTitle>Análisis por Proveedor</CardTitle>
                            <CardDescription>
                                Desglose de costes por proveedor para esta orden de trabajo
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {data.groupedData.byProvider.map((group) => (
                                    <Card key={group.provider.id}>
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <CardTitle className="text-lg">{group.provider.name}</CardTitle>
                                                    <CardDescription>{group.provider.cif}</CardDescription>
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
                                                        <TableHead>Fecha</TableHead>
                                                        <TableHead>Cantidad</TableHead>
                                                        <TableHead>Precio Unit.</TableHead>
                                                        <TableHead>Total</TableHead>
                                                        <TableHead>Factura</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {group.items.map((item) => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="font-medium">{item.material.name}</TableCell>
                                                            <TableCell>{formatDate(item.itemDate)}</TableCell>
                                                            <TableCell>{item.quantity.toNumber().toLocaleString()}</TableCell>
                                                            <TableCell>{formatCurrency(item.unitPrice.toNumber())}</TableCell>
                                                            <TableCell className="font-semibold">{formatCurrency(item.totalPrice.toNumber())}</TableCell>
                                                            <TableCell>
                                                                <Link
                                                                    href={`/facturas/${item.invoice.id}`}
                                                                    className="text-blue-600 hover:underline text-sm"
                                                                >
                                                                    {item.invoice.invoiceCode}
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                ))}
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
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {data.groupedData.byMaterial.map((group) => (
                                    <Card key={group.material.id}>
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <CardTitle className="text-lg">{group.material.name}</CardTitle>
                                                    <CardDescription>
                                                        {group.material.code} • {Array.from(group.uniqueProviders).join(', ')}
                                                    </CardDescription>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold">{formatCurrency(group.totalCost)}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {group.totalQuantity.toLocaleString()} unidades
                                                    </div>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Proveedor</TableHead>
                                                        <TableHead>Fecha</TableHead>
                                                        <TableHead>Cantidad</TableHead>
                                                        <TableHead>Precio Unit.</TableHead>
                                                        <TableHead>Total</TableHead>
                                                        <TableHead>Factura</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {group.items.map((item) => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="font-medium">{item.invoice.provider.name}</TableCell>
                                                            <TableCell>{formatDate(item.itemDate)}</TableCell>
                                                            <TableCell>{item.quantity.toNumber().toLocaleString()}</TableCell>
                                                            <TableCell>{formatCurrency(item.unitPrice.toNumber())}</TableCell>
                                                            <TableCell className="font-semibold">{formatCurrency(item.totalPrice.toNumber())}</TableCell>
                                                            <TableCell>
                                                                <Link
                                                                    href={`/facturas/${item.invoice.id}`}
                                                                    className="text-blue-600 hover:underline text-sm"
                                                                >
                                                                    {item.invoice.invoiceCode}
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
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
                                                        <TableHead>Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {group.items.map((item) => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="font-medium">{item.material.name}</TableCell>
                                                            <TableCell>{item.invoice.provider.name}</TableCell>
                                                            <TableCell>{formatDate(item.itemDate)}</TableCell>
                                                            <TableCell>{item.quantity.toNumber().toLocaleString()}</TableCell>
                                                            <TableCell className="font-semibold">{formatCurrency(item.totalPrice.toNumber())}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="all-items">
                    <Card>
                        <CardHeader>
                            <CardTitle>Todos los Items</CardTitle>
                            <CardDescription>
                                Lista completa de todos los items de esta orden de trabajo
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Material</TableHead>
                                        <TableHead>Proveedor</TableHead>
                                        <TableHead>Cantidad</TableHead>
                                        <TableHead>Precio Unit.</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Factura</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{formatDate(item.itemDate)}</TableCell>
                                            <TableCell className="font-medium">{item.material.name}</TableCell>
                                            <TableCell>{item.invoice.provider.name}</TableCell>
                                            <TableCell>{item.quantity.toNumber().toLocaleString()}</TableCell>
                                            <TableCell>{formatCurrency(item.unitPrice.toNumber())}</TableCell>
                                            <TableCell className="font-semibold">{formatCurrency(item.totalPrice.toNumber())}</TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/facturas/${item.invoice.id}`}
                                                    className="text-blue-600 hover:underline text-sm"
                                                >
                                                    {item.invoice.invoiceCode}
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
} 