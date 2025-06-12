import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Overview } from "@/components/overview"
import { PriceAlerts } from "@/components/price-alerts"
import { getDashboardStats, getOverviewData } from "@/lib/actions/dashboard"

export default async function Home() {
  const [stats, overviewData] = await Promise.all([
    getDashboardStats(),
    getOverviewData()
  ])

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold">Panel de Control</h1>

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

        <div className="p-6 rounded-lg bg-white border border-border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Alertas de Precio</div>
          <div className="text-3xl font-bold mt-2">{stats.pendingAlerts}</div>
        </div>
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
