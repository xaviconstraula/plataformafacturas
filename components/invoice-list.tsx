"use client"

import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { DeleteInvoiceButton } from "./delete-invoice-button"

interface InvoiceListProps {
  invoices: {
    id: string
    invoiceCode: string
    provider: {
      name: string
    }
    items: {
      quantity: number
      totalPrice: number
      material: {
        name: string
      }
    }[]
    issueDate: Date
  }[]
  totalPages: number
  currentPage: number
  pageSize: number
  totalCount: number
  searchParams: Record<string, string | undefined>
}

export function InvoiceList({ invoices, totalPages, currentPage, pageSize, totalCount, searchParams }: InvoiceListProps) {

  function createPageURL(pageNumber: number): string {
    const params = new URLSearchParams()
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && key !== 'page') {
        params.set(key, value)
      }
    })
    params.set('page', String(pageNumber))
    return `/facturas?${params.toString()}`
  }

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalCount)

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
              <TableHead className="w-[120px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length > 0 ? (
              invoices.map((invoice) => {
                const firstItem = invoice.items[0];
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceCode}</TableCell>
                    <TableCell>{invoice.provider.name}</TableCell>
                    <TableCell>{firstItem?.material.name || 'N/A'}</TableCell>
                    <TableCell>{firstItem?.quantity || 0}</TableCell>
                    <TableCell>{formatCurrency(Number(firstItem?.totalPrice || 0))}</TableCell>
                    <TableCell>{invoice.issueDate.toLocaleDateString("es-ES")}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/facturas/${invoice.id}`} passHref>
                        <Button variant="ghost" size="icon" aria-label="Ver factura">
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                      </Link>
                      <DeleteInvoiceButton invoiceId={invoice.id} />
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {totalCount === 0 && !searchParams.size ? 'No hay facturas creadas todavía.' : 'No se encontraron facturas con los filtros aplicados.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between space-x-2">
          <div className="text-sm text-muted-foreground">
            Mostrando {startItem} a {endItem} de {totalCount} facturas
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} asChild>
              <Link href={createPageURL(currentPage - 1)} aria-disabled={currentPage <= 1}>
                <ChevronLeftIcon className="h-4 w-4 mr-1" />
                Anterior
              </Link>
            </Button>
            <div className="text-sm font-medium">
              Página {currentPage} de {totalPages}
            </div>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} asChild>
              <Link href={createPageURL(currentPage + 1)} aria-disabled={currentPage >= totalPages}>
                Siguiente
                <ChevronRightIcon className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
