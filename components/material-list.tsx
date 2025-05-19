"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon } from "lucide-react"
import { EditMaterialDialog } from './edit-material-dialog'
import { DeleteMaterialDialog } from './delete-material-dialog'

interface MaterialListProps {
  materials: {
    id: string
    code: string
    name: string
    description: string | null
    _count: {
      invoiceItems: number
    }
  }[]
}

export function MaterialList({ materials }: MaterialListProps) {
  const [page, setPage] = useState(1)
  const itemsPerPage = 10

  const totalPages = Math.ceil(materials.length / itemsPerPage)
  const paginatedMaterials = materials.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Facturas</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMaterials.length > 0 ? (
              paginatedMaterials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell>{material.name}</TableCell>
                  <TableCell>{material.description || 'N/A'}</TableCell>
                  <TableCell>{material._count.invoiceItems}</TableCell>
                  <TableCell className="space-x-1">
                    <EditMaterialDialog materialId={material.id}>
                      <Button variant="ghost" size="icon" aria-label="Editar material">
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                    </EditMaterialDialog>
                    <DeleteMaterialDialog materialId={material.id} materialName={material.name}>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Eliminar material">
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </DeleteMaterialDialog>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No se encontraron materiales.
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
