"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { SearchIcon } from "lucide-react"

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Cleanup function to clear timeout if value changes before delay
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function InvoiceFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize state from URL search params
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "")
  const [month, setMonth] = useState(searchParams.get("month") || "")
  const [quarter, setQuarter] = useState(searchParams.get("quarter") || "")
  const [year, setYear] = useState(searchParams.get("year") || "")

  const debouncedSearchTerm = useDebounce(searchTerm, 150) // Debounce search input by 150ms

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  // Function to update URL params, wrapped in useCallback for stability
  const updateUrlParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString()) // Start with existing params (like page)

    // Set or delete params based on state
    if (debouncedSearchTerm) {
      params.set("search", debouncedSearchTerm)
    } else {
      params.delete("search")
    }

    if (month && month !== 'all') {
      params.set("month", month)
      params.delete("quarter") // Month takes precedence over quarter
    } else {
      params.delete("month")
      // Only set quarter if month is not set or is 'all'
      if (quarter && quarter !== 'all') {
        params.set("quarter", quarter)
      } else {
        params.delete("quarter")
      }
    }

    if (year && year !== 'all') {
      params.set("year", year)
    } else {
      params.delete("year")
    }

    // Reset page to 1 when filters change
    params.set("page", "1")

    router.push(`/facturas?${params.toString()}`, { scroll: false }) // Use scroll: false to prevent jumping to top
  }, [debouncedSearchTerm, month, quarter, year, router, searchParams])

  // Effect to update URL when debounced search term or other filters change
  useEffect(() => {
    updateUrlParams()
  }, [debouncedSearchTerm, month, quarter, year, updateUrlParams])

  // Handlers for select changes
  const handleMonthChange = (value: string) => {
    setMonth(value)
    if (value && value !== 'all') {
      setQuarter('all') // Reset quarter if a specific month is chosen
    }
  }

  const handleQuarterChange = (value: string) => {
    setQuarter(value)
    if (value && value !== 'all') {
      setMonth('all') // Reset month if a specific quarter is chosen
    }
  }

  const handleYearChange = (value: string) => {
    setYear(value)
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
          <Select value={month} onValueChange={handleMonthChange}>
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
          <Select value={quarter} onValueChange={handleQuarterChange}>
            <SelectTrigger id="quarter">
              <SelectValue placeholder="Todos los trimestres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los trimestres</SelectItem>
              <SelectItem value="1">T1 (Ene-Mar)</SelectItem>
              <SelectItem value="2">T2 (Abr-Jun)</SelectItem>
              <SelectItem value="3">T3 (Jul-Sep)</SelectItem>
              <SelectItem value="4">T4 (Oct-Dic)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="year" className="text-sm font-medium">
            Año
          </label>
          <Select value={year} onValueChange={handleYearChange}>
            <SelectTrigger id="year">
              <SelectValue placeholder="Todos los años" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
