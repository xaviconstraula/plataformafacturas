'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'
import { deleteProviderAction } from '@/lib/actions/proveedores'
import { toast } from 'sonner'

interface DeleteSupplierDialogProps {
    supplierId: string
    supplierName: string
    children: React.ReactNode
}

export function DeleteSupplierDialog({ supplierId, supplierName, children }: DeleteSupplierDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isPending, startTransition] = useState(false)

    async function handleDelete() {
        startTransition(true)
        try {
            const result = await deleteProviderAction(supplierId)
            if (result.success) {
                toast.success(result.message)
                setIsOpen(false)
            } else {
                toast.error(result.message)
            }
        } catch (error) {
            console.error('Error in deleteSupplierAction:', error)
            toast.error('Ocurrió un error inesperado al intentar eliminar el proveedor.')
        } finally {
            startTransition(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Eliminar Proveedor</DialogTitle>
                    <DialogDescription>
                        ¿Estás seguro de que deseas eliminar al proveedor {supplierName}? Esta acción no se puede deshacer.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                <span className="ml-2">Eliminando...</span>
                            </>
                        ) : (
                            'Eliminar'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 