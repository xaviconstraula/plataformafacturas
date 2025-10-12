import { Suspense } from "react"
import Link from "next/link"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"
import { MaterialsBySupplier } from "@/components/materials-by-supplier"
import { HelpTooltip } from "@/components/help-tooltip"
import { helpContent } from "@/components/help-content"
import { getMaterialAnalyticsPaginated, getSupplierAnalyticsPaginated } from "@/lib/actions/analytics"
import { getMaterialsBySupplierType } from "@/lib/actions/dashboard"
import { prisma } from "@/lib/db"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import {
    MaterialAnalyticsSkeleton,
    SupplierAnalyticsSkeleton,
    ChartSkeleton,
    CardSkeleton
} from "@/components/ui/skeleton"
import { Package, Users, DollarSign } from "lucide-react"
import { requireAuth } from "@/lib/auth-utils"

// Fast-loading filter options data fetcher
async function getFilterOptions() {
    const user = await requireAuth()

    // Load only essential filter data with smaller limits to ensure fast loading
    const [suppliers, materials, categories, workOrders] = await Promise.all([
        prisma.provider.findMany({
            where: { userId: user.id },
            select: { id: true, name: true, type: true },
            orderBy: { name: 'asc' },
            take: 200 // Reduced limit for faster loading
        }),
        prisma.material.findMany({
            where: {
                userId: user.id,
                isActive: true
            }, // Only active materials for the user
            select: { id: true, name: true, code: true, category: true },
            orderBy: { name: 'asc' },
            take: 200 // Reduced limit for faster loading
        }).then(materials => materials.map(m => ({ ...m, category: m.category || undefined }))),
        // Get distinct categories using proper Prisma query
        prisma.material.findMany({
            where: {
                userId: user.id,
                category: { not: null },
                isActive: true
            },
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
            take: 30 // Reduced limit for faster loading
        }).then(results => results.map(r => r.category).filter(Boolean) as string[]),
        // Get distinct work orders using proper Prisma query
        prisma.invoiceItem.findMany({
            where: {
                workOrder: { not: null },
                material: { userId: user.id },
                invoice: { provider: { userId: user.id } }
            },
            select: { workOrder: true },
            distinct: ['workOrder'],
            orderBy: { workOrder: 'asc' },
            take: 50 // Reduced limit for faster loading
        }).then(results => results.map(r => r.workOrder).filter(Boolean) as string[]),
    ])

    return {
        suppliers,
        materials,
        categories,
        workOrders
    }
}

// Analytics dashboard component with streaming optimization
function AnalyticsDataContent() {
    return (
        <div className="space-y-6">
            {/* Load critical stats first */}
            <Suspense fallback={<StatsCardsSkeleton />}>
                <QuickStatsContent />
            </Suspense>

            {/* Load main analytics with comprehensive skeleton */}
            <Suspense fallback={<AnalyticsLoadingSkeleton />}>
                <AnalyticsDataInner />
            </Suspense>
        </div>
    )
}

// Quick stats that load fast to give immediate feedback
async function QuickStatsContent() {
    const user = await requireAuth()

    // Load only essential summary stats quickly
    const [materialCount, supplierCount, invoiceCount] = await Promise.all([
        prisma.material.count({ where: { userId: user.id, isActive: true } }),
        prisma.provider.count({ where: { userId: user.id } }),
        prisma.invoice.count({ where: { provider: { userId: user.id } } })
    ])

    return (
        <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
                <div className="flex items-center">
                    <div className="p-2 bg-blue-100 rounded-full">
                        <Package className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="ml-4">
                        <p className="text-sm font-medium text-muted-foreground">Materiales Activos</p>
                        <p className="text-2xl font-bold">{materialCount.toLocaleString()}</p>
                    </div>
                </div>
            </div>
            <div className="rounded-lg border p-4">
                <div className="flex items-center">
                    <div className="p-2 bg-green-100 rounded-full">
                        <Users className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="ml-4">
                        <p className="text-sm font-medium text-muted-foreground">Proveedores</p>
                        <p className="text-2xl font-bold">{supplierCount.toLocaleString()}</p>
                    </div>
                </div>
            </div>
            <div className="rounded-lg border p-4">
                <div className="flex items-center">
                    <div className="p-2 bg-orange-100 rounded-full">
                        <DollarSign className="h-4 w-4 text-orange-600" />
                    </div>
                    <div className="ml-4">
                        <p className="text-sm font-medium text-muted-foreground">Total Facturas</p>
                        <p className="text-2xl font-bold">{invoiceCount.toLocaleString()}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Stats cards skeleton for quick loading feedback
function StatsCardsSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} className="h-24" />
            ))}
        </div>
    )
}

async function AnalyticsDataInner() {
    // Load analytics data and filter options in parallel with smaller initial page size for faster loading
    const [materialAnalyticsResult, supplierAnalyticsResult, filterOptions] = await Promise.all([
        getMaterialAnalyticsPaginated({
            sortBy: 'cost',
            sortOrder: 'desc',
            pageSize: 25, // Reduced initial page size for faster loading
            page: 1
        }),
        getSupplierAnalyticsPaginated({
            includeMonthlyBreakdown: true,
            pageSize: 25, // Reduced initial page size for faster loading
            page: 1
        }),
        getFilterOptions()
    ])

    const { suppliers, materials, categories, workOrders } = filterOptions

    return (
        <AnalyticsDashboard
            materialAnalytics={materialAnalyticsResult.materials}
            supplierAnalytics={supplierAnalyticsResult.suppliers}
            suppliers={suppliers}
            materials={materials}
            categories={categories}
            workOrders={workOrders}
        />
    )
}

// Materials by supplier chart component
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

// Custom analytics loading skeleton
function AnalyticsLoadingSkeleton() {
    return (
        <div className="space-y-6">
            {/* Filter section skeleton */}
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                        <div className="h-10 w-full bg-muted rounded animate-pulse" />
                    </div>
                ))}
            </div>

            {/* Stats cards skeleton */}
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} className="h-32" />
                ))}
            </div>

            {/* Analytics sections skeleton */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                    <ChartSkeleton className="h-[300px]" />
                </div>
                <div className="space-y-4">
                    <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                    <ChartSkeleton className="h-[300px]" />
                </div>
            </div>

            {/* Tables skeleton */}
            <div className="grid gap-6 lg:grid-cols-2">
                <MaterialAnalyticsSkeleton />
                <SupplierAnalyticsSkeleton />
            </div>
        </div>
    )
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

            {/* Main Analytics Dashboard */}
            <ErrorBoundary>
                <AnalyticsDataContent />
            </ErrorBoundary>

            {/* Materials by Supplier Chart */}
            <ErrorBoundary>
                <MaterialsBySupplierContent />
            </ErrorBoundary>
        </div>
    )
} 