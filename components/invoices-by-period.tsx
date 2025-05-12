"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { invoicesByPeriodData } from "@/lib/mock-data"

export function InvoicesByPeriod() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={invoicesByPeriodData}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
        <Tooltip formatter={(value) => [`${value} facturas`, ""]} labelFormatter={(label) => `Trimestre: ${label}`} />
        <Legend />
        <Bar dataKey="2023" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="2024" fill="#64748b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="2025" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
