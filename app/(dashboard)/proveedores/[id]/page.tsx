import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExcelExportButton } from "@/components/excel-export-button"
import { formatCurrency } from "@/lib/utils"
import { getSupplierAnalytics } from "@/lib/actions/analytics"
import { prisma } from "@/lib/db"
import Link from "next/link"
import {
    Building2Icon,
    PhoneIcon,
    MailIcon,
    MapPinIcon,
    FileTextIcon,
    PackageIcon,
    CalendarIcon,
    TrendingUpIcon,
    ClipboardListIcon,
    DollarSignIcon
} from "lucide-react"
import { GoBackButton } from "@/components/go-back-button"

interface SupplierDetailPageProps {
    params: Promise<{ id: string }>
}

async function getSupplier(id: string) {
    const supplier = await prisma.provider.findUnique({
        where: { id },
        include: {
            invoices: {
                include: {
                    items: {
                        include: {
                            material: true
                        }
                    }
                },
                orderBy: { issueDate: 'desc' },
                take: 20 // Get recent invoices
            }
        }
    })

    if (!supplier) {
        return null
    }

    return supplier
}

export default async function SupplierDetailPage({ params }: SupplierDetailPageProps) {
    const resolvedParams = await params
    const supplier = await getSupplier(resolvedParams.id)

    if (!supplier) {
        notFound()
    }

    const [supplierAnalytics] = await getSupplierAnalytics({
        supplierId: resolvedParams.id,
        includeMonthlyBreakdown: true
    })

    // Calculate additional metrics
    const recentInvoices = supplier.invoices.slice(0, 10)
    const allItems = supplier.invoices.flatMap(invoice => invoice.items)

    // Get unique work orders
    const workOrders = [...new Set(allItems.map(item => item.workOrder).filter(Boolean))]

    // Get monthly spending data for chart (last 12 months)
    const monthlyData = supplierAnalytics.monthlySpending.slice(-12)

    return (
        <div className="flex flex-col gap-6">
            {/* Header Section */}
            <div className="flex items-start justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Building2Icon className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{supplier.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                                <span className="font-medium">CIF: {supplier.cif}</span>
                                <span>•</span>
                                <Badge variant={supplier.type === 'MATERIAL_SUPPLIER' ? 'default' : 'secondary'}>
                                    {supplier.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ExcelExportButton
                        filters={{ supplierId: supplier.id }}
                        includeDetails={true}
                        variant="outline"
                    />
                    <GoBackButton
                        fallbackUrl="/proveedores"
                        label="Volver a Proveedores"
                    />
                </div>
            </div>

            {/* Contact Information */}
            {(supplier.email || supplier.phone || supplier.address) && (
                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <PhoneIcon className="h-5 w-5 text-blue-600" />
                            Información de Contacto
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {supplier.email && (
                                <div className="flex items-center gap-2">
                                    <MailIcon className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm">{supplier.email}</span>
                                </div>
                            )}
                            {supplier.phone && (
                                <div className="flex items-center gap-2">
                                    <PhoneIcon className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm">{supplier.phone}</span>
                                </div>
                            )}
                            {supplier.address && (
                                <div className="flex items-center gap-2">
                                    <MapPinIcon className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm">{supplier.address}</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                            <DollarSignIcon className="h-4 w-4 text-emerald-600" />
                            Gasto Total
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">{formatCurrency(supplierAnalytics.totalSpent)}</div>
                        <p className="text-xs text-gray-500 mt-1">{supplierAnalytics.invoiceCount} facturas</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                            <PackageIcon className="h-4 w-4 text-blue-600" />
                            Materiales
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">{supplierAnalytics.materialCount}</div>
                        <p className="text-xs text-gray-500 mt-1">productos diferentes</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-purple-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                            <TrendingUpIcon className="h-4 w-4 text-purple-600" />
                            Promedio por Factura
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">{formatCurrency(supplierAnalytics.averageInvoiceAmount)}</div>
                        <p className="text-xs text-gray-500 mt-1">gasto promedio</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-orange-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                            <CalendarIcon className="h-4 w-4 text-orange-600" />
                            Última Factura
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                            {supplierAnalytics.lastInvoiceDate.toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short'
                            })}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {supplierAnalytics.lastInvoiceDate.toLocaleDateString('es-ES', { year: 'numeric' })}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Work Orders Summary */}
            {workOrders.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ClipboardListIcon className="h-5 w-5 text-indigo-600" />
                            Órdenes de Trabajo / CECO
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {workOrders.slice(0, 20).map((wo, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                    {wo}
                                </Badge>
                            ))}
                            {workOrders.length > 20 && (
                                <Badge variant="secondary" className="text-xs">
                                    +{workOrders.length - 20} más
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Detailed Information Tabs */}
            <Tabs defaultValue="invoices" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="invoices" className="flex items-center gap-2">
                        <FileTextIcon className="h-4 w-4" />
                        Facturas Recientes
                    </TabsTrigger>
                    <TabsTrigger value="materials" className="flex items-center gap-2">
                        <PackageIcon className="h-4 w-4" />
                        Materiales Top
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="flex items-center gap-2">
                        <TrendingUpIcon className="h-4 w-4" />
                        Análisis
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="invoices" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Facturas Recientes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Código</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead className="text-center">Materiales</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentInvoices.length > 0 ? (
                                            recentInvoices.map((invoice) => (
                                                <TableRow key={invoice.id}>
                                                    <TableCell className="font-mono text-sm">{invoice.invoiceCode}</TableCell>
                                                    <TableCell>{invoice.issueDate.toLocaleDateString("es-ES")}</TableCell>
                                                    <TableCell className="text-right font-medium">{formatCurrency(invoice.totalAmount.toNumber())}</TableCell>
                                                    <TableCell className="flex justify-center">
                                                        <div className="flex flex-wrap justify-center gap-1 max-w-xs">
                                                            {invoice.items.slice(0, 3).map((item, idx) => (
                                                                <Badge key={idx} variant="outline" className="text-xs">
                                                                    {item.material.name}
                                                                </Badge>
                                                            ))}
                                                            {invoice.items.length > 3 && (
                                                                <Badge variant="secondary" className="text-xs">
                                                                    +{invoice.items.length - 3}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Link href={`/facturas/${invoice.id}`}>
                                                            <Button variant="default" size="sm">
                                                                Ver
                                                            </Button>
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center">
                                                    No hay facturas registradas para este proveedor.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="materials" className="mt-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Top Materiales por Coste</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {supplierAnalytics.topMaterialsByCost.slice(0, 10).map((material, index) => (
                                        <div key={material.materialId} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                                    <span className="text-xs font-medium text-blue-600">{index + 1}</span>
                                                </div>
                                                <div>
                                                    <Link
                                                        href={`/materiales/${material.materialId}`}
                                                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                                                    >
                                                        {material.materialName}
                                                    </Link>
                                                    <p className="text-xs text-gray-500">
                                                        {material.totalQuantity.toFixed(2)} unidades
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-medium text-gray-900">{formatCurrency(material.totalCost)}</div>
                                                <div className="text-xs text-gray-500">{formatCurrency(material.averagePrice)}/ud</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Top Materiales por Cantidad</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {supplierAnalytics.topMaterialsByQuantity.slice(0, 10).map((material, index) => (
                                        <div key={material.materialId} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                                                    <span className="text-xs font-medium text-green-600">{index + 1}</span>
                                                </div>
                                                <div>
                                                    <Link
                                                        href={`/materiales/${material.materialId}`}
                                                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                                                    >
                                                        {material.materialName}
                                                    </Link>
                                                    <p className="text-xs text-gray-500">
                                                        {formatCurrency(material.totalCost)} total
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-medium text-gray-900">{material.totalQuantity.toFixed(2)}</div>
                                                <div className="text-xs text-gray-500">{formatCurrency(material.averagePrice)}/ud</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="analytics" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Evolución del Gasto Mensual</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {monthlyData.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {monthlyData.map((month) => (
                                            <div key={month.month} className="p-4 rounded-lg border bg-gray-50">
                                                <div className="text-sm text-gray-600 mb-1">
                                                    {new Date(month.month + '-01').toLocaleDateString('es-ES', {
                                                        year: 'numeric',
                                                        month: 'long'
                                                    })}
                                                </div>
                                                <div className="text-lg font-semibold text-gray-900">{formatCurrency(month.totalSpent)}</div>
                                                <div className="text-xs text-gray-500">{month.invoiceCount} facturas</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    No hay datos de gasto mensual disponibles.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
} 