import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MaterialsBySupplier } from "@/components/materials-by-supplier"
import { PriceEvolution } from "@/components/price-evolution"
import { ReportFilters } from "@/components/report-filters"

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Reportes</h1>

      <ReportFilters />

      <div className="grid gap-6">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Evolución de Precios</CardTitle>
            <CardDescription>Seguimiento de precios de materiales a lo largo del tiempo</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-80 rounded-lg bg-muted animate-pulse" />}>
              <PriceEvolution />
            </Suspense>
          </CardContent>
        </Card>


      </div>

      <Card>
        <CardHeader>
          <CardTitle>Materiales por Tipo de Proveedor</CardTitle>
          <CardDescription>Análisis de los materiales más utilizados según el tipo de proveedor</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
            <MaterialsBySupplier />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
