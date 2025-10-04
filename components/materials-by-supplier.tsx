"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  TooltipProps,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMemo } from "react"

const COLORS = {
  Materiales: "#2EB19C",
  Maquinaria: "#F97B5C"
}

interface RawMaterialData {
  name: string
  value: number
  supplier: "Materiales" | "Maquinaria"
}

interface ChartDataEntry {
  materialName: string
  value: number
  supplier: "Materiales" | "Maquinaria"
}

const SUPPLIER_TYPE_MAP = {
  Materiales: "Proveedor de Materiales",
  Maquinaria: "Alquiler de Maquinaria",
}

// Function to truncate long material names
function truncateMaterialName(name: string, maxLength: number = 35): string {
  if (name.length <= maxLength) return name
  return name.substring(0, maxLength - 3) + "..."
}

interface MaterialsBySupplierProps {
  data: RawMaterialData[]
}

export function MaterialsBySupplier({ data: rawData }: MaterialsBySupplierProps) {
  const transformedData = useMemo(() => {
    if (!rawData) return []

    // Sort data by value in descending order and truncate long names
    return rawData
      .map(item => ({
        materialName: truncateMaterialName(item.name),
        fullName: item.name, // Keep original name for tooltips
        value: item.value,
        supplier: item.supplier
      }))
      .sort((a, b) => b.value - a.value)
  }, [rawData])

  // Create legend data
  const legendData = useMemo(() => {
    return Object.entries(SUPPLIER_TYPE_MAP).map(([key, value]) => ({
      value: key,
      type: value,
      color: COLORS[key as keyof typeof COLORS]
    }))
  }, [])

  if (!rawData) {
    return <div className="h-[350px] w-full flex items-center justify-center text-gray-500 font-medium">Loading chart data...</div>
  }

  if (transformedData.length === 0) {
    return <div className="h-[350px] w-full flex items-center justify-center text-gray-500 font-medium">No data available to display.</div>
  }

  // Calculate dynamic height based on number of items
  const itemHeight = 50 // Reduced from 55 to 50 for more compact display
  const minHeight = 400
  const chartHeight = Math.max(minHeight, transformedData.length * itemHeight)

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Materiales por Tipo de Proveedor</CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribución de los materiales con más volumen de compra entre proveedores y alquileres de maquinaria
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          {/* Custom Legend */}
          <div className="flex justify-end gap-6">
            {legendData.map((item) => (
              <div key={item.value} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-muted-foreground">
                  {item.type}
                </span>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ height: `${chartHeight}px`, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={transformedData}
                layout="vertical"
                margin={{
                  top: 15,
                  right: 30,
                  left: 260, // Increased from 220 to 260 for better spacing with truncated names
                  bottom: 15,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{
                    fill: '#6B7280',
                    fontSize: 11, // Reduced from 12 to 11
                  }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickFormatter={(value) => `${value}€`}
                />
                <YAxis
                  type="category"
                  dataKey="materialName"
                  tick={{
                    fill: '#6B7280',
                    fontSize: 10, // Reduced from 12 to 10 for better fit
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={240} // Increased from 200 to 240
                  interval={0}
                />
                <Tooltip
                  formatter={(value: number) => {
                    return [`${value} €`]
                  }}
                  labelFormatter={(label, payload) => {
                    const entry = (payload as any)?.[0]?.payload as any
                    if (entry) {
                      const materialName = entry.fullName || entry.materialName
                      return `${materialName} - ${SUPPLIER_TYPE_MAP[entry.supplier as keyof typeof SUPPLIER_TYPE_MAP]}`
                    }
                    return String(label)
                  }}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '12px', // Reduced from 13px to 12px
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    maxWidth: '300px', // Add max width to prevent overly wide tooltips
                  }}
                  labelStyle={{
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: '#111827',
                    wordWrap: 'break-word',
                  }}
                />
                <Bar
                  dataKey="value"
                  name="value"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  barSize={32} // Reduced from 35 to 32 for more compact display
                >
                  {transformedData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[entry.supplier]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
