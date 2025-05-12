"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchIcon, FilterIcon } from "lucide-react"

export function InvoiceFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "")
  const [month, setMonth] = useState(searchParams.get("month") || "")
  const [quarter, setQuarter] = useState(searchParams.get("quarter") || "")
  const [year, setYear] = useState(searchParams.get("year") || "")

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  const handleApplyFilters = () => {
    const params = new URLSearchParams()

    if (searchTerm) params.set("search", searchTerm)
    if (month) params.set("month", month)
    if (quarter) params.set("quarter", quarter)
    if (year) params.set("year", year)

    router.push(`/facturas?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      <div className="flex-1 space-y-2">
        <label htmlFor="search" className="text-sm font-medium">
          Buscar
        </label>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            type="search"
            placeholder="Buscar por proveedor, material o código..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor="month" className="text-sm font-medium">
            Mes
          </label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="month">
              <SelectValue placeholder="Todos los meses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              <SelectItem value="1">Enero</SelectItem>
              <SelectItem value="2">Febrero</SelectItem>
              <SelectItem value="3">Marzo</SelectItem>
              <SelectItem value="4">Abril</SelectItem>
              <SelectItem value="5">Mayo</SelectItem>
              <SelectItem value="6">Junio</SelectItem>
              <SelectItem value="7">Julio</SelectItem>
              <SelectItem value="8">Agosto</SelectItem>
              <SelectItem value="9">Septiembre</SelectItem>
              <SelectItem value="10">Octubre</SelectItem>
              <SelectItem value="11">Noviembre</SelectItem>
              <SelectItem value="12">Diciembre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="quarter" className="text-sm font-medium">
            Trimestre
          </label>
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger id="quarter">
              <SelectValue placeholder="Todos los trimestres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los trimestres</SelectItem>
              <SelectItem value="1">Q1 (Ene-Mar)</SelectItem>
              <SelectItem value="2">Q2 (Abr-Jun)</SelectItem>
              <SelectItem value="3">Q3 (Jul-Sep)</SelectItem>
              <SelectItem value="4">Q4 (Oct-Dic)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="year" className="text-sm font-medium">
            Año
          </label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="year">
              <SelectValue placeholder="Todos los años" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button className="gap-2" onClick={handleApplyFilters}>
        <FilterIcon className="h-4 w-4" />
        Aplicar Filtros
      </Button>
    </div>
  )
}
