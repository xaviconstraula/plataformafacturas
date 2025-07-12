import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { PackageIcon, TrendingUpIcon, UsersIcon } from "lucide-react"

interface Material {
    id: string
    name: string
    code: string
    category: string | null
}

interface MaterialSummaryData {
    material: Material
    totalCost: number
    totalQuantity: number
    itemCount: number
    uniqueProviders: Set<string>
    costPercentage: number
    averageUnitPrice: number
}

interface MaterialsSummaryProps {
    materials: MaterialSummaryData[]
    totalCost: number
    className?: string
}

export function MaterialsSummary({ materials, totalCost, className }: MaterialsSummaryProps) {
    // Show top 10 materials by cost and create a summary for the rest
    const topMaterials = materials.slice(0, 10)
    const remainingMaterials = materials.slice(10)
    const remainingCount = remainingMaterials.length
    const remainingCost = remainingMaterials.reduce((sum, m) => sum + m.totalCost, 0)

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <PackageIcon className="h-5 w-5" />
                            Resumen de Materiales
                        </CardTitle>
                        <CardDescription>
                            Top 10 materiales por coste • {materials.length} materiales en total
                        </CardDescription>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-muted-foreground">Coste Total</div>
                        <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Top Materials */}
                    {topMaterials.map((materialData, index) => (
                        <div
                            key={materialData.material.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-xs">
                                        #{index + 1}
                                    </Badge>
                                    <h4 className="font-medium text-sm truncate">
                                        {materialData.material.name}
                                    </h4>
                                </div>

                                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                                    <span className="flex items-center gap-1">
                                        <PackageIcon className="h-3 w-3" />
                                        {materialData.totalQuantity.toLocaleString()} uds
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <UsersIcon className="h-3 w-3" />
                                        {materialData.uniqueProviders.size} proveedores
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <TrendingUpIcon className="h-3 w-3" />
                                        {formatCurrency(materialData.averageUnitPrice)} /ud promedio
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span>Porcentaje del total</span>
                                        <span className="font-medium">{materialData.costPercentage.toFixed(1)}%</span>
                                    </div>
                                    <Progress value={materialData.costPercentage} className="h-1.5" />
                                </div>
                            </div>

                            <div className="text-right ml-4">
                                <div className="text-lg font-bold">
                                    {formatCurrency(materialData.totalCost)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {materialData.itemCount} items
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Remaining Materials Summary */}
                    {remainingCount > 0 && (
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className="text-xs">
                                        +{remainingCount}
                                    </Badge>
                                    <h4 className="font-medium text-sm text-muted-foreground">
                                        Otros materiales
                                    </h4>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Porcentaje del total</span>
                                        <span className="font-medium">{((remainingCost / totalCost) * 100).toFixed(1)}%</span>
                                    </div>
                                    <Progress value={(remainingCost / totalCost) * 100} className="h-1.5" />
                                </div>
                            </div>

                            <div className="text-right ml-4">
                                <div className="text-lg font-bold">
                                    {formatCurrency(remainingCost)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {remainingMaterials.reduce((sum, m) => sum + m.itemCount, 0)} items
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
