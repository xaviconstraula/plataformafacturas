"use client"

import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { FilterIcon } from "lucide-react"

export function ReportFilters() {
  const [period, setPeriod] = useState("all")
  const [material, setMaterial] = useState("all")
  const [supplier, setSupplier] = useState("all")

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor="period" className="text-sm font-medium">
            Período
          </label>
          <Select onValueChange={(value) => setPeriod(value)}>
            <SelectTrigger id="period">
              <SelectValue placeholder="Todos los períodos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los períodos</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
              <SelectItem value="quarter">Trimestral</SelectItem>
              <SelectItem value="year">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="material" className="text-sm font-medium">
            Material
          </label>
          <Select onValueChange={(value) => setMaterial(value)}>
            <SelectTrigger id="material">
              <SelectValue placeholder="Todos los materiales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los materiales</SelectItem>
              <SelectItem value="acero">Acero Inoxidable</SelectItem>
              <SelectItem value="aluminio">Aluminio</SelectItem>
              <SelectItem value="polietileno">Polietileno</SelectItem>
              <SelectItem value="madera">Madera de Pino</SelectItem>
              <SelectItem value="vidrio">Vidrio Templado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="supplier" className="text-sm font-medium">
            Proveedor
          </label>
          <Select onValueChange={(value) => setSupplier(value)}>
            <SelectTrigger id="supplier">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              <SelectItem value="aceros">Aceros del Norte</SelectItem>
              <SelectItem value="metales">Metales Precisos</SelectItem>
              <SelectItem value="plasticos">Plásticos Modernos</SelectItem>
              <SelectItem value="maderas">Maderas Premium</SelectItem>
              <SelectItem value="vidrios">Vidrios Claros</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button className="gap-2">
        <FilterIcon className="h-4 w-4" />
        Aplicar Filtros
      </Button>
    </div>
  )
}
