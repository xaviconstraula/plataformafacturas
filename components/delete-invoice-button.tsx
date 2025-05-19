"use client"

import { TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deleteInvoiceAction } from "@/lib/actions/facturas"
import { useTransition } from "react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { useState } from "react"

interface DeleteInvoiceButtonProps {
    invoiceId: string
    onSuccess?: () => void
}

export function DeleteInvoiceButton({ invoiceId, onSuccess }: DeleteInvoiceButtonProps) {
    const [isPending, startTransition] = useTransition()
    const [isOpen, setIsOpen] = useState(false)

    async function handleDelete() {
        startTransition(async () => {
            try {
                const result = await deleteInvoiceAction(invoiceId)
                if (result.success) {
                    toast.success(result.message)
                    if (onSuccess) {
                        onSuccess()
                    }
                } else {
                    toast.error(result.message || "No se pudo eliminar la factura.")
                }
            } catch (error) {
                console.error("Error in deleteInvoiceAction transition:", error)
                toast.error("Ocurrió un error inesperado al intentar eliminar la factura.")
            } finally {
                setIsOpen(false)
            }
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label="Eliminar factura"
                >
                    <TrashIcon className="h-4 w-4 text-red-500 hover:text-red-700" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirmar eliminación</DialogTitle>
                    <DialogDescription>
                        ¿Está seguro de que desea eliminar esta factura? Esta acción no se puede deshacer.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setIsOpen(false)}
                        disabled={isPending}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            "Eliminar"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 