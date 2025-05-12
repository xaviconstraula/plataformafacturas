"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts"
import { priceEvolutionData } from "@/lib/mock-data"

export function PriceEvolution() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={priceEvolutionData}>
        <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}€`}
        />
        <Tooltip formatter={(value) => [`${value}€`, ""]} labelFormatter={(label) => `Mes: ${label}`} />
        <Legend />
        <Line
          type="monotone"
          dataKey="Acero Inoxidable"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line type="monotone" dataKey="Aluminio" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        <Line
          type="monotone"
          dataKey="Polietileno"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
