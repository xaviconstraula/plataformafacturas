"use client"

import { useState } from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "lucide-react"

interface SupplierListProps {
  suppliers: {
    id: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    _count: {
      invoices: number
    }
  }[]
}

export function SupplierList({ suppliers }: SupplierListProps) {
  const [page, setPage] = useState(1)
  const itemsPerPage = 10

  const totalPages = Math.ceil(suppliers.length / itemsPerPage)
  const paginatedSuppliers = suppliers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Facturas</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSuppliers.length > 0 ? (
              paginatedSuppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.email || 'N/A'}</TableCell>
                  <TableCell>{supplier.phone || 'N/A'}</TableCell>
                  <TableCell>{supplier.address || 'N/A'}</TableCell>
                  <TableCell>{supplier._count.invoices}</TableCell>
                  <TableCell>
                    <Link href={`/proveedores/${supplier.id}`}>
                      <Button variant="ghost" size="icon">
                        <EyeIcon className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No se encontraron proveedores.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">
            Página {page} de {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
