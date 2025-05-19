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

interface MaterialsBySupplierProps {
  data: RawMaterialData[]
}

export function MaterialsBySupplier({ data: rawData }: MaterialsBySupplierProps) {
  const transformedData = useMemo(() => {
    if (!rawData) return []
    return rawData.map(item => ({
      materialName: item.name,
      value: item.value,
      supplier: item.supplier
    }))
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Materiales por Tipo de Proveedor</CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribución de materiales entre proveedores y alquileres de maquinaria
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
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={transformedData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 60,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  vertical={false}
                />
                <XAxis
                  dataKey="materialName"
                  tick={{
                    fill: '#6B7280',
                    fontSize: 12,
                    width: 80
                  }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  interval={0}
                  height={60}
                  angle={-45}
                  textAnchor="end"
                />
                <YAxis
                  tick={{
                    fill: '#6B7280',
                    fontSize: 12,
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value} mil`}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => {
                    return [`${value} mil €`]
                  }}
                  labelFormatter={(label: string, payload: Array<{ payload?: ChartDataEntry }>) => {
                    const entry = payload?.[0]?.payload
                    if (entry) {
                      return `${label} - ${SUPPLIER_TYPE_MAP[entry.supplier]}`
                    }
                    return label
                  }}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  labelStyle={{
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: '#111827',
                  }}
                />
                <Bar
                  dataKey="value"
                  name="value"
                  radius={[4, 4, 0, 0]}
                  fill={COLORS.Materiales}
                  isAnimationActive={false}
                  maxBarSize={60}
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
