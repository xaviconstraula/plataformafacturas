"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Material, Provider } from "@/generated/prisma"

type SerializedInvoice = {
    id: string
    invoiceCode: string
    providerId: string
    issueDate: Date
    totalAmount: number
    pdfUrl: string | null
    status: string
    createdAt: Date
    updatedAt: Date
    provider: Provider
}

type SerializedInvoiceItem = {
    id: string
    createdAt: Date
    updatedAt: Date
    invoiceId: string
    materialId: string
    quantity: number
    unitPrice: number
    totalPrice: number
    itemDate: Date
    workOrder: string | null
    description: string | null
    lineNumber: number | null
    material: Material
    invoice: SerializedInvoice
}

interface MaterialGroupData {
    material: Material
    items: SerializedInvoiceItem[]
    totalCost: number
    totalQuantity: number
    uniqueProviders: string[] // Changed from Set to Array
}

interface MaterialItemCardProps {
    group: MaterialGroupData
}

export function MaterialItemCard({ group }: MaterialItemCardProps) {
    const [visibleCount, setVisibleCount] = useState(5)
    const displayItems = group.items.slice(0, visibleCount)
    const remainingItems = group.items.length - visibleCount
    const hasMoreItems = remainingItems > 0

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">{group.material.name}</CardTitle>
                        <CardDescription>
                            {group.material.code} • {group.uniqueProviders.join(', ')}
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
                            <TableHead>Total (c/IVA)</TableHead>
                            <TableHead>Factura</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.invoice.provider.name}</TableCell>
                                <TableCell>{formatDate(item.itemDate)}</TableCell>
                                <TableCell>{item.quantity.toLocaleString()}</TableCell>
                                <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                                <TableCell className="font-semibold">{formatCurrency(item.totalPrice * 1.21)}</TableCell>
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
                {group.items.length > 5 && (
                    <div className="mt-3 text-center">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (hasMoreItems) {
                                    setVisibleCount(prev => Math.min(prev + 10, group.items.length))
                                } else {
                                    setVisibleCount(5)
                                }
                            }}
                        >
                            {hasMoreItems
                                ? `Ver más (${Math.min(10, remainingItems)} de ${remainingItems} adicionales)`
                                : 'Ver menos'
                            }
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
