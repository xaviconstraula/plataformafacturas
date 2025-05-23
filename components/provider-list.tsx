"use client"

import { useState } from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, PencilIcon, TrashIcon } from "lucide-react"
import { DeleteProviderDialog } from "./delete-provider-dialog"
import { EditProviderDialog } from "./edit-provider-dialog"
import { ProviderType } from "@/generated/prisma"

interface ProviderListProps {
    providers: {
        id: string
        name: string
        type: ProviderType
        email: string | null
        phone: string | null
        address: string | null
        _count: {
            invoices: number
        }
    }[]
}

export function ProviderList({ providers }: ProviderListProps) {
    const [page, setPage] = useState(1)
    const itemsPerPage = 10

    const totalPages = Math.ceil(providers.length / itemsPerPage)
    const paginatedProviders = providers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const getProviderTypeLabel = (type: ProviderType) => {
        return type === 'MATERIAL_SUPPLIER' ? 'Proveedor de Materiales' : 'Alquiler de Maquinaria'
    }

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead>Facturas</TableHead>
                            <TableHead className="w-[120px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedProviders.length > 0 ? (
                            paginatedProviders.map((provider) => (
                                <TableRow key={provider.id}>
                                    <TableCell className="font-medium">{provider.name}</TableCell>
                                    <TableCell>{getProviderTypeLabel(provider.type)}</TableCell>
                                    <TableCell>{provider.email || 'N/A'}</TableCell>
                                    <TableCell>{provider.phone || 'N/A'}</TableCell>
                                    <TableCell>{provider._count.invoices}</TableCell>
                                    <TableCell className="space-x-1">
                                        <EditProviderDialog
                                            providerId={provider.id}
                                            initialData={{
                                                name: provider.name,
                                                type: provider.type,
                                                email: provider.email,
                                                phone: provider.phone,
                                                address: provider.address,
                                            }}
                                        >
                                            <Button variant="ghost" size="icon" aria-label="Editar proveedor">
                                                <PencilIcon className="h-4 w-4" />
                                            </Button>
                                        </EditProviderDialog>
                                        <DeleteProviderDialog
                                            providerId={provider.id}
                                            providerName={provider.name}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive"
                                                aria-label="Eliminar proveedor"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </Button>
                                        </DeleteProviderDialog>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
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