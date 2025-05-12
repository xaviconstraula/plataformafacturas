"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangleIcon, CheckIcon, XIcon } from "lucide-react"
import { formatCurrency, formatPercentage } from "@/lib/utils"
import { toast } from "sonner"
import { updateAlertStatus } from "@/lib/actions/alerts"
import { type PriceAlert } from "@/lib/types/prisma"

interface AlertListProps {
  initialAlerts: PriceAlert[]
}

export function AlertList({ initialAlerts }: AlertListProps) {
  const [alerts, setAlerts] = useState<PriceAlert[]>(initialAlerts)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  const handleApprove = async (id: string) => {
    try {
      setIsUpdating(id)
      await updateAlertStatus(id, "APPROVED")
      setAlerts(alerts.map((alert) => (alert.id === id ? {
        ...alert,
        status: "APPROVED"
      } : alert)))
      toast.success("La alerta de precio ha sido aprobada.")
    } catch {
      toast.error("No se pudo actualizar la alerta.")
    } finally {
      setIsUpdating(null)
    }
  }

  const handleReject = async (id: string) => {
    try {
      setIsUpdating(id)
      await updateAlertStatus(id, "REJECTED")
      setAlerts(alerts.map((alert) => (alert.id === id ? {
        ...alert,
        status: "REJECTED"
      } : alert)))
      toast.success("La alerta de precio ha sido rechazada.")
    } catch {
      toast.error("No se pudo actualizar la alerta.")
    } finally {
      setIsUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <Card
          key={alert.id}
          className={
            alert.status === "APPROVED"
              ? "border-green-200 bg-green-50"
              : alert.status === "REJECTED"
                ? "border-red-200 bg-red-50"
                : ""
          }
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon
                  className={`h-5 w-5 ${alert.status === "APPROVED"
                    ? "text-green-500"
                    : alert.status === "REJECTED"
                      ? "text-red-500"
                      : "text-amber-500"
                    }`}
                />
                <CardTitle>{alert.material.name}</CardTitle>
              </div>
              <Badge
                variant="outline"
                className={`${alert.status === "APPROVED"
                  ? "border-green-200 bg-green-100 text-green-700"
                  : alert.status === "REJECTED"
                    ? "border-red-200 bg-red-100 text-red-700"
                    : "border-amber-200 bg-amber-100 text-amber-700"
                  }`}
              >
                {alert.status === "APPROVED"
                  ? "Aprobado"
                  : alert.status === "REJECTED"
                    ? "Rechazado"
                    : `+${formatPercentage(alert.percentageChange)}`}
              </Badge>
            </div>
            <CardDescription>
              Proveedor: {alert.provider.name} | Detectado el {new Date(alert.createdAt).toLocaleDateString("es-ES")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Precio anterior</p>
                  <p className="text-lg font-medium">{formatCurrency(alert.previousPrice)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Precio actual</p>
                  <p className="text-lg font-medium">{formatCurrency(alert.currentPrice)}</p>
                </div>
              </div>

              {alert.status === "PENDING" && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-green-200 bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800"
                    onClick={() => handleApprove(alert.id)}
                    disabled={isUpdating === alert.id}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-red-200 bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800"
                    onClick={() => handleReject(alert.id)}
                    disabled={isUpdating === alert.id}
                  >
                    <XIcon className="h-4 w-4" />
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
