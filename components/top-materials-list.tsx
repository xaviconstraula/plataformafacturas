"use client"

import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"

interface MaterialEntry {
    materialId: string
    materialName: string
    totalQuantity: number
    totalCost: number
    averagePrice: number
}

interface TopMaterialsListProps {
    title: string
    materials: MaterialEntry[]
    variant: "cost" | "quantity"
    initialSize?: number
    batchSize?: number
}

export function TopMaterialsList({
    title,
    materials,
    variant,
    initialSize = 10,
    batchSize = 20
}: TopMaterialsListProps) {
    const [visibleCount, setVisibleCount] = useState(initialSize)

    function handleShowMore() {
        setVisibleCount((prev) => Math.min(prev + batchSize, materials.length))
    }

    const orderedMaterials = [...materials].sort((a, b) => {
        return variant === "cost" ? b.totalCost - a.totalCost : b.totalQuantity - a.totalQuantity
    })

    const display = orderedMaterials.slice(0, visibleCount)

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {display.length > 0 ? (
                        display.map((material, index) => (
                            <div
                                key={material.materialId}
                                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-6 h-6 rounded-full ${variant === "cost" ? "bg-blue-100" : "bg-green-100"
                                            } flex items-center justify-center`}
                                    >
                                        <span
                                            className={`text-xs font-medium ${variant === "cost" ? "text-blue-600" : "text-green-600"
                                                }`}
                                        >
                                            {index + 1}
                                        </span>
                                    </div>
                                    <div>
                                        <Link
                                            href={`/materiales/${material.materialId}`}
                                            className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                                        >
                                            {material.materialName}
                                        </Link>
                                        <p className="text-xs text-gray-500">
                                            {variant === "cost"
                                                ? `${material.totalQuantity.toFixed(2)} unidades`
                                                : `${formatCurrency(material.totalCost)} total`}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-medium text-gray-900">
                                        {variant === "cost"
                                            ? formatCurrency(material.totalCost)
                                            : material.totalQuantity.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {formatCurrency(material.averagePrice)}/ud
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-sm text-gray-500 py-8">
                            No hay materiales para mostrar.
                        </div>
                    )}

                    {visibleCount < materials.length && (
                        <div className="flex justify-center pt-2">
                            <Button variant="outline" size="sm" onClick={handleShowMore}>
                                Ver {Math.min(batchSize, materials.length - visibleCount)} más
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
