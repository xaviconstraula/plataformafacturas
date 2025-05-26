"use client"

import { AlertTriangleIcon } from "lucide-react"
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
      <div className="flex items-center justify-center h-[350px] text-muted-foreground">
        No hay alertas pendientes
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <div key={alert.id} className="flex items-start space-x-4 rounded-lg border p-4">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <p className="font-medium">{alert.materialName}</p>
              <Badge variant="outline" className="text-amber-500 border-amber-200 bg-amber-50">
                +{formatPercentage(alert.percentage)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Proveedor: {alert.providerName}</p>
            <div className="flex justify-between text-sm">
              <span>Precio anterior: {formatCurrency(alert.oldPrice)}</span>
              <span className="font-medium">Nuevo: {formatCurrency(alert.newPrice)}</span>
            </div>

          </div>
        </div>
      ))}
    </div>
  )
}
