import { Suspense } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Overview } from "@/components/overview"
import { PriceAlerts } from "@/components/price-alerts"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { WelcomeBanner } from "@/components/welcome-banner"
import { getDashboardStats, getOverviewData } from "@/lib/actions/dashboard"

export default async function Home() {
  const [stats, overviewData] = await Promise.all([
    getDashboardStats(),
    getOverviewData()
  ])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Panel de Control</h1>
        <HelpTooltip
          title={helpContent.dashboard.title}
          description={helpContent.dashboard.description}
          content={helpContent.dashboard.content}
        />
      </div>

      {/* Welcome Banner */}
      <WelcomeBanner />

      {/* Stats Section - Simple Flat Design */}
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

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <Overview data={overviewData} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Alertas de Precios</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <PriceAlerts />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
