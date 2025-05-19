'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { editProviderAction } from '@/lib/actions/proveedores'
import { toast } from 'sonner'

interface EditProviderDialogProps {
    providerId: string
    initialData: {
        name: string
        email: string | null
        phone: string | null
        address: string | null
    }
    children: React.ReactNode
}

export function EditProviderDialog({ providerId, initialData, children }: EditProviderDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isPending, startTransition] = useState(false)
    const [formData, setFormData] = useState(initialData)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        startTransition(true)
        try {
            const result = await editProviderAction(providerId, formData)
            if (result.success) {
                toast.success(result.message)
                setIsOpen(false)
            } else {
                toast.error(result.message)
            }
        } catch (error) {
            console.error('Error in editProviderAction:', error)
            toast.error('Ocurrió un error inesperado al intentar actualizar el proveedor.')
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
                    <DialogTitle>Editar Proveedor</DialogTitle>
                    <DialogDescription>
                        Modifica los datos del proveedor. Haz clic en guardar cuando termines.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Nombre</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email || ''}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value || null })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="phone">Teléfono</Label>
                            <Input
                                id="phone"
                                value={formData.phone || ''}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value || null })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="address">Dirección</Label>
                            <Input
                                id="address"
                                value={formData.address || ''}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value || null })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={isPending}
                        >
                            {isPending ? (
                                <>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    <span className="ml-2">Guardando...</span>
                                </>
                            ) : (
                                'Guardar Cambios'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
} 