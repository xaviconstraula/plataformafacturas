import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon, AlertTriangleIcon, CalendarIcon, DollarSignIcon, PackageIcon, TruckIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatPercentage, formatDate } from "@/lib/utils"
import { prisma } from "@/lib/db"

interface PageProps {
    params: Promise<{ id: string }>
}

async function getAlertDetails(alertId: string) {
    const alert = await prisma.priceAlert.findUnique({
        where: { id: alertId },
        include: {
            material: {
                include: {
                    invoiceItems: {
                        include: {
                            invoice: {
                                include: {
                                    provider: true
                                }
                            }
                        },
                        orderBy: {
                            itemDate: 'desc'
                        },
                        take: 10
                    }
                }
            },
            provider: true,
            invoice: {
                include: {
                    items: {
                        where: {
                            materialId: undefined // Will be set below
                        }
                    }
                }
            }
        }
    })

    if (!alert) return null

    // Get price history for this material from this provider
    const priceHistory = await prisma.invoiceItem.findMany({
        where: {
            materialId: alert.materialId,
            invoice: {
                providerId: alert.providerId
            }
        },
        include: {
            invoice: true
        },
        orderBy: {
            itemDate: 'desc'
        },
        take: 20
    })

    return {
        alert,
        priceHistory
    }
}

export default async function AlertDetailPage({ params }: PageProps) {
    const { id } = await params
    const data = await getAlertDetails(id)

    if (!data) {
        notFound()
    }

    const { alert, priceHistory } = data

    // Calculate price evolution
    const priceEvolution = priceHistory.map(item => ({
        date: item.itemDate,
        price: item.unitPrice.toNumber(),
        quantity: item.quantity.toNumber(),
        invoiceCode: item.invoice.invoiceCode,
        invoiceId: item.invoice.id
    }))

    const isIncrease = alert.newPrice.toNumber() > alert.oldPrice.toNumber()

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/alertas">
                        <ArrowLeftIcon className="h-4 w-4 mr-2" />
                        Volver a Alertas
                    </Link>
                </Button>
            </div>

            {/* Alert Summary */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <AlertTriangleIcon className="h-6 w-6 text-amber-500 mt-1" />
                            <div>
                                <CardTitle className="text-2xl">Alerta de Desviación de Precio</CardTitle>
                                <CardDescription className="mt-2">
                                    Detectada el {formatDate(alert.createdAt)}
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant={alert.status === 'PENDING' ? 'secondary' : 'outline'}>
                            {alert.status === 'PENDING' ? 'Pendiente' : alert.status}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                        <div className="flex items-center gap-3">
                            <PackageIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Material</p>
                                <p className="font-semibold">{alert.material.name}</p>
                                <p className="text-sm text-muted-foreground">{alert.material.code}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <TruckIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Proveedor</p>
                                <p className="font-semibold">{alert.provider.name}</p>
                                <p className="text-sm text-muted-foreground">{alert.provider.cif}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <DollarSignIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Cambio de Precio</p>
                                <p className="font-semibold">
                                    {formatCurrency(alert.oldPrice.toNumber())} → {formatCurrency(alert.newPrice.toNumber())}
                                </p>
                                <p className={`text-sm font-medium ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>
                                    {isIncrease ? '+' : ''}{formatPercentage(alert.percentage.toNumber())}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Fecha Efectiva</p>
                                <p className="font-semibold">{formatDate(alert.effectiveDate)}</p>
                                <Link
                                    href={`/facturas/${alert.invoiceId}`}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    Ver factura relacionada →
                                </Link>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Price History */}
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Precios</CardTitle>
                    <CardDescription>
                        Últimas 20 transacciones de este material con este proveedor
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {priceEvolution.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Precio Unitario</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Factura</TableHead>
                                    <TableHead>Variación</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {priceEvolution.map((item, index) => {
                                    const previousPrice = index < priceEvolution.length - 1 ? priceEvolution[index + 1].price : null
                                    const variation = previousPrice ? ((item.price - previousPrice) / previousPrice) * 100 : null

                                    return (
                                        <TableRow key={`${item.invoiceId}-${item.date.toISOString()}`}>
                                            <TableCell>{formatDate(item.date)}</TableCell>
                                            <TableCell className="font-medium">{formatCurrency(item.price)}</TableCell>
                                            <TableCell>{item.quantity.toLocaleString()}</TableCell>
                                            <TableCell>{formatCurrency(item.price * item.quantity)}</TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/facturas/${item.invoiceId}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {item.invoiceCode}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {variation !== null && (
                                                    <span className={variation > 0 ? 'text-red-600' : variation < 0 ? 'text-green-600' : 'text-gray-600'}>
                                                        {variation > 0 ? '+' : ''}{formatPercentage(variation)}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No hay historial de precios disponible
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
                <CardHeader>
                    <CardTitle>Actividad Reciente del Material</CardTitle>
                    <CardDescription>
                        Últimas transacciones de {alert.material.name} con todos los proveedores
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {alert.material.invoiceItems.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Proveedor</TableHead>
                                    <TableHead>Precio Unitario</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Factura</TableHead>
                                    <TableHead>OT/CECO</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {alert.material.invoiceItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{formatDate(item.itemDate)}</TableCell>
                                        <TableCell>{item.invoice.provider.name}</TableCell>
                                        <TableCell className="font-medium">{formatCurrency(item.unitPrice.toNumber())}</TableCell>
                                        <TableCell>{item.quantity.toNumber().toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/facturas/${item.invoice.id}`}
                                                className="text-blue-600 hover:underline"
                                            >
                                                {item.invoice.invoiceCode}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            {item.workOrder && (
                                                <Badge variant="outline">{item.workOrder}</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No hay actividad reciente disponible
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
} 