import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Overview } from "@/components/overview"
import { RecentInvoices } from "@/components/recent-invoices"
import { PriceAlerts } from "@/components/price-alerts"
import { MaterialsBySupplier } from "@/components/materials-by-supplier"
import { getDashboardStats, getOverviewData } from "@/lib/actions/dashboard"

export default async function Home() {
  const [stats, overviewData] = await Promise.all([
    getDashboardStats(),
    getOverviewData()
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Panel de Control</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<div className="h-24 rounded-lg bg-muted animate-pulse" />}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Facturas Totales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalInvoices}</div>
            </CardContent>
          </Card>
        </Suspense>

        <Suspense fallback={<div className="h-24 rounded-lg bg-muted animate-pulse" />}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Proveedores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProviders}</div>
            </CardContent>
          </Card>
        </Suspense>

        <Suspense fallback={<div className="h-24 rounded-lg bg-muted animate-pulse" />}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Materiales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMaterials}</div>
            </CardContent>
          </Card>
        </Suspense>

        <Suspense fallback={<div className="h-24 rounded-lg bg-muted animate-pulse" />}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Alertas de Precio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingAlerts}</div>
            </CardContent>
          </Card>
        </Suspense>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <CardDescription>Facturas procesadas en los últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <Overview data={overviewData} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Facturas Recientes</CardTitle>
            <CardDescription>Las últimas facturas procesadas</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <RecentInvoices recentInvoices={stats.recentInvoices} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Alertas de Precios</CardTitle>
            <CardDescription>Variaciones significativas detectadas</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <PriceAlerts />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Materiales por Proveedor</CardTitle>
            <CardDescription>Análisis de materiales más utilizados</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <MaterialsBySupplier />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
