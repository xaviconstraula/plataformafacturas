"use client"

import { AlertTriangleIcon } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPercentage } from "@/lib/utils"
import { getPendingPriceAlerts } from "@/lib/actions/dashboard"
import { useEffect, useState } from "react"

interface PriceAlert {
  id: string
  oldPrice: number
  newPrice: number
  percentage: number
  createdAt: string
  materialId: string
  providerId: string
  materialName: string
  providerName: string
}

export function PriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const pendingAlerts = await getPendingPriceAlerts()
        setAlerts(pendingAlerts)
      } catch (error) {
        console.error('Error fetching price alerts:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAlerts()
  }, [])

  if (isLoading) {
    return <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground">
        <AlertTriangleIcon className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No hay alertas pendientes</p>
        <p className="text-sm">Las desviaciones de precio aparecerán aquí</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <Link
          key={alert.id}
          href={`/alertas/${alert.id}`}
          className="block transition-all duration-200 hover:shadow-md hover:scale-[1.02]"
        >
          <div className="flex items-start space-x-4 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
            <AlertTriangleIcon className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium truncate">{alert.materialName}</p>
                <Badge variant="outline" className="text-amber-500 border-amber-200 bg-amber-50 flex-shrink-0">
                  +{formatPercentage(alert.percentage)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                Proveedor: {alert.providerName}
              </p>
              <div className="flex justify-between text-sm">
                <span>Precio anterior: {formatCurrency(alert.oldPrice)}</span>
                <span className="font-medium">Nuevo: {formatCurrency(alert.newPrice)}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  {new Date(alert.createdAt).toLocaleDateString('es-ES')}
                </span>
                <span className="text-xs text-blue-600 hover:underline">
                  Ver detalles →
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}

      {alerts.length > 0 && (
        <div className="pt-2">
          <Link
            href="/alertas"
            className="text-sm text-blue-600 hover:underline flex items-center justify-center"
          >
            Ver todas las alertas →
          </Link>
        </div>
      )}
    </div>
  )
}
