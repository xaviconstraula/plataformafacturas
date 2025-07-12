import { Suspense } from "react"
import Link from "next/link"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"
import { MaterialsBySupplier } from "@/components/materials-by-supplier"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { getMaterialAnalytics, getSupplierAnalytics } from "@/lib/actions/analytics"
import { getMaterialsBySupplierType } from "@/lib/actions/dashboard"
import { prisma } from "@/lib/db"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { MaterialAnalyticsSkeleton, SupplierAnalyticsSkeleton, ChartSkeleton } from "@/components/ui/skeleton"

// Separate component for analytics data to enable individual loading
function AnalyticsContent() {
    return (
        <Suspense fallback={<MaterialAnalyticsSkeleton />}>
            <AnalyticsDataContent />
        </Suspense>
    )
}

async function AnalyticsDataContent() {
    const [materialAnalytics, supplierAnalytics, suppliers, materials, categories, workOrders] = await Promise.all([
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
    ])

    return (
        <AnalyticsDashboard
            materialAnalytics={materialAnalytics}
            supplierAnalytics={supplierAnalytics}
            suppliers={suppliers}
            materials={materials}
            categories={categories}
            workOrders={workOrders}
        />
    )
}

// Separate component for materials by supplier chart
function MaterialsBySupplierContent() {
    return (
        <Suspense fallback={<ChartSkeleton className="h-[400px]" />}>
            <MaterialsBySupplierDataContent />
        </Suspense>
    )
}

async function MaterialsBySupplierDataContent() {
    const materialsBySupplierData = await getMaterialsBySupplierType()
    return <MaterialsBySupplier data={materialsBySupplierData} />
}

export default function AnalyticsPage() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Analíticas</h1>
                    <p className="text-muted-foreground">
                        Análisis detallado de materiales y proveedores
                    </p>
                </div>
                <HelpTooltip
                    title={helpContent.analytics.title}
                    description={helpContent.analytics.description}
                    content={helpContent.analytics.content}
                />
            </div>

            {/* Materials by Supplier Chart */}

            {/* Main Analytics Dashboard */}
            <ErrorBoundary>
                <AnalyticsContent />
            </ErrorBoundary>
            <ErrorBoundary>
                <MaterialsBySupplierContent />
            </ErrorBoundary>
        </div>
    )
} 