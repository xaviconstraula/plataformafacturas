"use client"

import { useState } from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { materials } from "@/lib/mock-data"

export function MaterialList() {
  const [page, setPage] = useState(1)
  const itemsPerPage = 5
  const totalPages = Math.ceil(materials.length / itemsPerPage)

  const paginatedMaterials = materials.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Último Precio</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMaterials.map((material) => (
              <TableRow key={material.id}>
                <TableCell className="font-medium">{material.name}</TableCell>
                <TableCell>{material.category}</TableCell>
                <TableCell>{material.supplier}</TableCell>
                <TableCell>{formatCurrency(material.lastPrice)}</TableCell>
                <TableCell>{material.unit}</TableCell>
                <TableCell>{material.stock}</TableCell>
                <TableCell>
                  <Link href={`/materiales/${material.id}`}>
                    <Button variant="ghost" size="icon">
                      <EyeIcon className="h-4 w-4" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
    </div>
  )
}
