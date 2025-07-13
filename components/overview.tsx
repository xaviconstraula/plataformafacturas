"use client"

import { useDashboardStats } from "@/hooks/use-analytics"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartSkeleton } from '@/components/ui/skeleton'

interface OverviewData {
  name: string
  total: number
}

interface OverviewProps {
  data?: OverviewData[]
}

export function Overview({ data: initialData }: OverviewProps) {
  const {
    data: stats,
    isLoading,
    error
  } = useDashboardStats()

  if (isLoading) {
    return <ChartSkeleton className="h-[320px]" />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[320px] text-muted-foreground">
        <p>Error al cargar los datos del gráfico</p>
      </div>
    )
  }

  // Use initialData if provided, otherwise create data from stats
  const chartData = initialData || (stats ? [
    { name: 'Facturas', total: stats.totalInvoices },
    { name: 'Proveedores', total: stats.totalProviders },
    { name: 'Materiales', total: stats.totalMaterials },
    { name: 'Alertas', total: stats.pendingAlerts },
  ] : [])

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: 'var(--constraula-gray)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--constraula-gray)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [value, 'Total']}
          labelStyle={{ color: 'var(--constraula-black)' }}
          contentStyle={{
            backgroundColor: 'var(--constraula-white)',
            border: '1px solid var(--border)',
            borderRadius: '6px'
          }}
        />
        <Bar
          dataKey="total"
          fill="var(--constraula-green)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
