import { Suspense } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Overview } from "@/components/overview"
import { PriceAlerts } from "@/components/price-alerts"
import { BatchHistoryCard } from "@/components/batch-history-card"
import { HelpTooltip } from "@/components/help-tooltip"
import { helpContent } from "@/components/help-content"
import { getDashboardStats, getOverviewData } from "@/lib/actions/dashboard"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { DashboardStatsSkeleton, ChartSkeleton, PriceAlertsSkeleton } from "@/components/ui/skeleton"
import { DashboardPrefetchWrapper } from "@/components/dashboard-prefetch-wrapper"

// Separate component for stats to enable individual loading
function DashboardStats() {
  return (
    <Suspense fallback={<DashboardStatsSkeleton />}>
      <StatsContent />
    </Suspense>
  )
}

async function StatsContent() {
  const stats = await getDashboardStats()

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
        <div className="text-sm font-medium text-muted-foreground">Facturas Totales</div>
        <div className="text-3xl font-bold mt-2">{stats.totalInvoices}</div>
      </div>

      <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
        <div className="text-sm font-medium text-muted-foreground">Proveedores</div>
        <div className="text-3xl font-bold mt-2">{stats.totalProviders}</div>
      </div>

      <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
        <div className="text-sm font-medium text-muted-foreground">Materiales</div>
        <div className="text-3xl font-bold mt-2">{stats.totalMaterials}</div>
      </div>

      <Link href="/alertas" className="block transition-all duration-200 hover:shadow-md hover:scale-[1.02]">
        <div className="p-6 rounded-lg bg-white border border-border shadow-sm cursor-pointer hover:bg-muted/50">
          <div className="text-sm font-medium text-muted-foreground">Alertas de Precio</div>
          <div className="text-3xl font-bold mt-2">{stats.pendingAlerts}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="text-blue-600 hover:underline">Ver todas las alertas →</span>
          </div>
        </div>
      </Link>
    </div>
  )
}

// Separate component for overview chart
function DashboardOverview() {
  return (
    <Suspense fallback={<ChartSkeleton className="h-[320px]" />}>
      <OverviewContent />
    </Suspense>
  )
}

async function OverviewContent() {
  const overviewData = await getOverviewData()
  return <Overview data={overviewData} />
}

// Separate component for price alerts
function DashboardPriceAlerts() {
  return (
    <Suspense fallback={<PriceAlertsSkeleton />}>
      <PriceAlerts />
    </Suspense>
  )
}

export default function Home() {
  return (
    <DashboardPrefetchWrapper>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Panel de Control</h1>
          <HelpTooltip
            title={helpContent.dashboard.title}
            description={helpContent.dashboard.description}
            content={helpContent.dashboard.content}
          />
        </div>

        {/* Stats Section with individual loading */}
        <ErrorBoundary>
          <DashboardStats />
        </ErrorBoundary>

        {/* Charts Section with individual loading */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <ErrorBoundary>
                <DashboardOverview />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Alertas de Precios</CardTitle>
            </CardHeader>
            <CardContent>
              <ErrorBoundary>
                <DashboardPriceAlerts />
              </ErrorBoundary>
            </CardContent>
          </Card>
        </div>

        {/* Batch History Section */}
        <ErrorBoundary>
          <BatchHistoryCard />
        </ErrorBoundary>
      </div>
    </DashboardPrefetchWrapper>
  )
}
