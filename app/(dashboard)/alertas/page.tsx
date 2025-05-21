import { Suspense } from "react"
import { AlertList } from "@/components/alert-list"
import { getPriceAlerts } from "@/lib/actions/alerts"

export default async function AlertsPage() {
  const alerts = await getPriceAlerts()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Alertas de Precios</h1>
      <p className="text-muted-foreground">
        Variaciones significativas en los precios de materiales detectadas automáticamente.
      </p>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <AlertList initialAlerts={alerts} />
      </Suspense>
    </div>
  )
}
