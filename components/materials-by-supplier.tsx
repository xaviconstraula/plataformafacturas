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
} from "recharts"
import { getMaterialsBySupplierType } from "@/lib/actions/dashboard"
import { useEffect, useState } from "react"

const COLORS = ["#3b82f6", "#22c55e"] // Updated to match image colors

// Assumes the backend action getMaterialsBySupplierType returns an array of objects
// where 'supplier' field holds the supplier type string (e.g., "Materiales" or "Maquinaria").
interface RawMaterialData {
  name: string // Material name
  value: number
  supplier: "Materiales" | "Maquinaria" // Supplier type - UPDATED
}

interface ChartDataEntry {
  materialName: string
  MATERIAL_SUPPLIER?: number
  MACHINERY_RENTAL?: number
}

const SUPPLIER_TYPE_MAP = {
  MATERIAL_SUPPLIER: "Material Supplier",  // Simplified text
  MACHINERY_RENTAL: "Machinery Rental",    // Simplified text
}

export function MaterialsBySupplier() {
  const [data, setData] = useState<ChartDataEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchDataAndTransform() {
      setIsLoading(true)
      try {
        const rawData = await getMaterialsBySupplierType() as RawMaterialData[]
        console.log("Raw data from getMaterialsBySupplierType:", rawData)

        const transformed = new Map<string, ChartDataEntry>()

        rawData.forEach(item => {
          const { name: materialName, value, supplier: supplierType } = item
          console.log(`Processing item: ${materialName}, Supplier Type: '${supplierType}', Value: ${value}`)

          if (!transformed.has(materialName)) {
            transformed.set(materialName, { materialName })
          }
          const entry = transformed.get(materialName)!

          if (supplierType === "Materiales") { // UPDATED condition
            entry.MATERIAL_SUPPLIER = (entry.MATERIAL_SUPPLIER || 0) + value
          } else if (supplierType === "Maquinaria") { // UPDATED condition
            entry.MACHINERY_RENTAL = (entry.MACHINERY_RENTAL || 0) + value
          } else {
            console.warn(`Unknown supplier type for ${materialName}: '${supplierType}'`)
          }
        })

        const finalChartData = Array.from(transformed.values());
        console.log("Transformed chart data:", finalChartData);
        setData(finalChartData)
      } catch (error) {
        console.error("Failed to fetch or transform material data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDataAndTransform()
  }, [])

  if (isLoading) {
    return <div className="h-[350px] w-full flex items-center justify-center text-gray-500 font-medium">Loading chart data...</div>
  }

  if (data.length === 0) {
    return <div className="h-[350px] w-full flex items-center justify-center text-gray-500 font-medium">No data available to display.</div>
  }

  return (
    <div className="h-[350px] w-full p-4 bg-white rounded-lg">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 30,
          }}
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="materialName"
            tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }}
            tickLine={{ stroke: '#e5e7eb' }}
            axisLine={{ stroke: '#e5e7eb' }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }}
            tickLine={{ stroke: '#e5e7eb' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(value) => new Intl.NumberFormat('es-ES', {
              notation: 'compact',
              maximumFractionDigits: 1
            }).format(value)}
          />
          <Tooltip
            formatter={(value: number, name: keyof typeof SUPPLIER_TYPE_MAP) => [
              `${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)}`,
              SUPPLIER_TYPE_MAP[name] || name,
            ]}
            labelFormatter={(label: string) => `${label}`}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: 500,
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            }}
            labelStyle={{
              fontWeight: 600,
              marginBottom: '4px',
            }}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
            }}
            formatter={(value) => (
              <span style={{ color: '#374151', fontSize: '13px', fontWeight: 500 }}>
                {value}
              </span>
            )}
          />
          <Bar
            dataKey="MATERIAL_SUPPLIER"
            fill={COLORS[0]}
            name={SUPPLIER_TYPE_MAP.MATERIAL_SUPPLIER}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="MACHINERY_RENTAL"
            fill={COLORS[1]}
            name={SUPPLIER_TYPE_MAP.MACHINERY_RENTAL}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
