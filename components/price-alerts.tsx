import { AlertTriangleIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPercentage } from "@/lib/utils"
import { priceAlerts } from "@/lib/mock-data"

export function PriceAlerts() {
  // Mostrar solo alertas pendientes en el dashboard
  const pendingAlerts = priceAlerts.filter((alert) => alert.status === "pending")

  return (
    <div className="space-y-4">
      {pendingAlerts.map((alert) => (
        <div key={alert.id} className="flex items-start space-x-4 rounded-lg border p-4">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <p className="font-medium">{alert.material}</p>
              <Badge variant="outline" className="text-amber-500 border-amber-200 bg-amber-50">
                +{formatPercentage(alert.percentageChange)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{alert.supplier}</p>
            <div className="flex justify-between text-sm">
              <span>Precio anterior: {formatCurrency(alert.previousPrice)}</span>
              <span className="font-medium">Nuevo: {formatCurrency(alert.currentPrice)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Detectado el {new Date(alert.date).toLocaleDateString("es-ES")}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
