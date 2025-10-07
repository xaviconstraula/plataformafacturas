"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartSkeleton } from '@/components/ui/skeleton'

interface OverviewData {
  name: string
  total: number
}

interface OverviewProps {
  data?: OverviewData[]
}

export function Overview({ data: initialData }: OverviewProps) {
  // Pure presentational: render provided data; show skeleton if missing
  const chartData = initialData || []
  if (chartData.length === 0) {
    return <ChartSkeleton className="h-[320px]" />
  }

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
