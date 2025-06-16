import { Suspense } from "react"
import Link from "next/link"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"
import { MaterialsBySupplier } from "@/components/materials-by-supplier"
import { getMaterialAnalytics, getSupplierAnalytics } from "@/lib/actions/analytics"
import { getMaterialsBySupplierType } from "@/lib/actions/dashboard"
import { prisma } from "@/lib/db"

async function getAnalyticsData() {
    const [materialAnalytics, supplierAnalytics, suppliers, materials, categories, workOrders, materialsBySupplierData] = await Promise.all([
        getMaterialAnalytics({ sortBy: 'cost', sortOrder: 'desc', limit: 50 }),
        getSupplierAnalytics({ includeMonthlyBreakdown: true }),
        prisma.provider.findMany({
            select: { id: true, name: true, type: true },
            orderBy: { name: 'asc' }
        }),
        prisma.material.findMany({
            select: { id: true, name: true, code: true, category: true },
            orderBy: { name: 'asc' }
        }).then(materials => materials.map(m => ({ ...m, category: m.category || undefined }))),
        prisma.material.findMany({
            select: { category: true },
            where: { category: { not: null } },
            distinct: ['category']
        }).then(results => results.map(r => r.category!).filter(Boolean)),
        prisma.invoiceItem.findMany({
            select: { workOrder: true },
            where: { workOrder: { not: null } },
            distinct: ['workOrder']
        }).then(results => results.map(r => r.workOrder!).filter(Boolean)),
        getMaterialsBySupplierType()
    ])

    return {
        materialAnalytics,
        supplierAnalytics,
        suppliers,
        materials,
        categories,
        workOrders,
        materialsBySupplierData
    }
}

export default async function AnalyticsPage() {
    const data = await getAnalyticsData()

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Analíticas</h1>
                    <p className="text-muted-foreground">
                        Resumen general y tendencias de compra.

                    </p>
                </div>
            </div>

            <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
                <AnalyticsDashboard
                    materialAnalytics={data.materialAnalytics}
                    supplierAnalytics={data.supplierAnalytics}
                    suppliers={data.suppliers}
                    materials={data.materials}
                    categories={data.categories}
                    workOrders={data.workOrders}
                />
            </Suspense>

            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
                <MaterialsBySupplier data={data.materialsBySupplierData} />
            </Suspense>
        </div>
    )
} 