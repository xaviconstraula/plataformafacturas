"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { filterInvoices, type Invoice } from "@/lib/mock-data"

interface InvoiceListProps {
  searchParams?: {
    month?: string
    quarter?: string
    year?: string
    supplier?: string
    search?: string
  }
}

export function InvoiceList({ searchParams }: InvoiceListProps = {}) {
  const [page, setPage] = useState(1)
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([])
  const itemsPerPage = 5

  useEffect(() => {
    // Aplicar filtros cuando cambien los parámetros de búsqueda
    const filtered = filterInvoices({
      month: searchParams?.month,
      quarter: searchParams?.quarter,
      year: searchParams?.year,
      supplier: searchParams?.supplier,
      searchTerm: searchParams?.search,
    })
    setFilteredInvoices(filtered)
    setPage(1) // Resetear a la primera página cuando cambian los filtros
  }, [searchParams])

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage)
  const paginatedInvoices = filteredInvoices.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Importe</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedInvoices.length > 0 ? (
              paginatedInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.code}</TableCell>
                  <TableCell>{invoice.supplier}</TableCell>
                  <TableCell>{invoice.material}</TableCell>
                  <TableCell>{invoice.quantity}</TableCell>
                  <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell>{new Date(invoice.date).toLocaleDateString("es-ES")}</TableCell>
                  <TableCell>
                    <Link href={`/facturas/${invoice.id}`}>
                      <Button variant="ghost" size="icon">
                        <EyeIcon className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No se encontraron facturas con los filtros aplicados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {filteredInvoices.length > 0 && (
        <div className="flex items-center justify-end space-x-2">
          <Button variant="outline" size="icon" onClick={() => setPage(page > 1 ? page - 1 : 1)} disabled={page === 1}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <div className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(page < totalPages ? page + 1 : totalPages)}
            disabled={page === totalPages}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
