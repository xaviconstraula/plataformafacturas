"use client"

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { getMaterialsBySupplierType } from "@/lib/actions/dashboard"
import { useEffect, useState } from "react"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#ec4899"]

interface MaterialData {
  name: string
  value: number
  supplier: string
}

export function MaterialsBySupplier() {
  const [data, setData] = useState<MaterialData[]>([])

  useEffect(() => {
    async function fetchData() {
      const materialsData = await getMaterialsBySupplierType()
      setData(materialsData)
    }
    fetchData()
  }, [])

  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={120}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [`${value}%`, "Porcentaje"]} labelFormatter={(name) => `Material: ${name}`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
