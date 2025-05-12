'use client'

import { useState } from 'react'
// import { useActionState } from 'react' // Removed unused import
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogClose, DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'
// import { TrashIcon } from 'lucide-react' // Removed unused import
import { deleteMaterial } from '@/lib/actions/materiales' // Import the server action
import { useToast } from '@/hooks/use-toast' // Corrected import path

interface DeleteMaterialDialogProps {
    materialId: string
    materialName: string
    children: React.ReactNode // To use a custom trigger button
}

export function DeleteMaterialDialog({
    materialId,
    materialName,
    children,
}: DeleteMaterialDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { toast } = useToast()

    // useActionState setup - although deleteMaterial returns a simple object, we can adapt
    // We might not need the full complexity of useActionState if we just trigger and show toast
    // Let's use a simpler approach first: call the action directly on submit

    async function handleDelete() {
        const result = await deleteMaterial(materialId)
        if (result.success) {
            toast({ title: 'Éxito', description: result.message })
            setIsOpen(false) // Close dialog on success
            // Revalidation happens via revalidatePath in the server action
        } else {
            toast({
                title: 'Error',
                description: result.message,
                variant: 'destructive',
            })
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirmar Eliminación</DialogTitle>
                    <DialogDescription>
                        ¿Estás seguro de que deseas eliminar el material {" "}
                        <strong>{materialName}</strong>?
                        Esta acción no se puede deshacer.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:justify-end">
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button type="button" variant="destructive" onClick={handleDelete}>
                        Eliminar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 