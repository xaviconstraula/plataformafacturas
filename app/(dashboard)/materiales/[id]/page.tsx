import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExcelExportButton } from "@/components/excel-export-button"
import { GoBackButton } from "@/components/go-back-button"
import { formatCurrency } from "@/lib/utils"
import { getMaterialAnalytics } from "@/lib/actions/analytics"
import { prisma } from "@/lib/db"
import Link from "next/link"

interface MaterialDetailPageProps {
    params: Promise<{ id: string }>
}

async function getMaterial(id: string) {
    const material = await prisma.material.findUnique({
        where: { id },
        include: {
            productGroup: true,
            invoiceItems: {
                include: {
                    invoice: {
                        include: {
                            provider: true
                        }
                    }
                },
                orderBy: { itemDate: 'desc' }
            }
        }
    })

    if (!material) {
        return null
    }

    return material
}

export default async function MaterialDetailPage({ params }: MaterialDetailPageProps) {
    const resolvedParams = await params
    const material = await getMaterial(resolvedParams.id)

    if (!material) {
        notFound()
    }

    const materialAnalyticsArray = await getMaterialAnalytics({
        materialId: resolvedParams.id
    })
    const materialAnalytics = materialAnalyticsArray[0]

    if (!materialAnalytics) {
        notFound()
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{material.name}</h1>
                    <div className="flex items-center gap-4 text-muted-foreground">
                        <span>Código: {material.code}</span>
                        {material.referenceCode && (
                            <>
                                <span>•</span>
                                <span>Ref. Proveedor: {material.referenceCode}</span>
                            </>
                        )}
                        {material.category && (
                            <>
                                <span>•</span>
                                <span>Categoría: {material.category}</span>
                            </>
                        )}
                        {material.productGroup && (
                            <>
                                <span>•</span>
                                <span>Grupo: {material.productGroup.standardizedName}</span>
                            </>
                        )}
                    </div>
                </div>
                <GoBackButton
                    fallbackUrl="/materiales"
                    label="Volver a Materiales"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Cantidad Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{materialAnalytics.totalQuantity}</div>
                        <p className="text-xs text-muted-foreground">unidades compradas</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Coste Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(materialAnalytics.totalCost)}</div>
                        <p className="text-xs text-muted-foreground">gasto acumulado</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Proveedores</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{materialAnalytics.supplierCount}</div>
                        <p className="text-xs text-muted-foreground">proveedores diferentes</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Precio Promedio</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(materialAnalytics.averageUnitPrice)}</div>
                        <p className="text-xs text-muted-foreground">por unidad</p>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Transaction History */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle>Historial de Transacciones</CardTitle>
                    <ExcelExportButton
                        filters={{ materialId: material.id }}
                        includeDetails={true}
                        variant="outline"
                        size="sm"
                    />
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Proveedor</TableHead>
                                    <TableHead>Factura</TableHead>
                                    <TableHead className="text-right">Cantidad</TableHead>
                                    <TableHead className="text-right">Precio Unit.</TableHead>
                                    <TableHead className="text-center">Total</TableHead>
                                    <TableHead>OT/CECO</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {material.invoiceItems.length > 0 ? (
                                    material.invoiceItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.invoice.issueDate.toLocaleDateString("es-ES")}</TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/proveedores/${item.invoice.provider.id}`}
                                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                >
                                                    {item.invoice.provider.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/facturas/${item.invoice.id}`}
                                                    className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-sm"
                                                >
                                                    {item.invoice.invoiceCode}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-right">{item.quantity.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.unitPrice.toNumber())}</TableCell>
                                            <TableCell className="text-center font-medium">{formatCurrency(item.totalPrice.toNumber())}</TableCell>
                                            <TableCell>
                                                {item.workOrder && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {item.workOrder}
                                                    </Badge>
                                                )}
                                            </TableCell>

                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
                                            No hay transacciones registradas para este material.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 