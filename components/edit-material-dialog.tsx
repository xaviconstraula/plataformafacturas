'use client'

import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogClose, DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getMaterialById, updateMaterial, type MaterialFormState } from '@/lib/actions/materiales'
import { useToast } from '@/hooks/use-toast'
import type { Material } from '@/generated/prisma' // Corrected Prisma type import path again
import { Loader2 } from 'lucide-react'

interface EditMaterialDialogProps {
    materialId: string
    children: React.ReactNode // Trigger element
}

const initialState: MaterialFormState = { message: '', errors: {} }

export function EditMaterialDialog({ materialId, children }: EditMaterialDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [materialData, setMaterialData] = useState<Material | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [errorLoading, setErrorLoading] = useState<string | null>(null)
    const { toast } = useToast()

    const [state, formAction, isPending] = useActionState(updateMaterial, initialState)

    // Fetch material data when dialog opens
    useEffect(() => {
        if (isOpen && materialId && !materialData) {
            setIsLoading(true)
            setErrorLoading(null)
            getMaterialById(materialId)
                .then(data => {
                    if (data.material) {
                        setMaterialData(data.material)
                    } else {
                        setErrorLoading(data.error || 'No se pudo cargar el material.')
                        toast({ title: 'Error', description: data.error || 'No se pudo cargar el material.', variant: 'destructive' })
                        // Optionally close dialog if material not found
                        // setIsOpen(false)
                    }
                })
                .catch(err => {
                    console.error("Fetch error:", err)
                    setErrorLoading('Error al buscar el material.')
                    toast({ title: 'Error', description: 'Error al buscar el material.', variant: 'destructive' })
                })
                .finally(() => setIsLoading(false))
        }
        // Reset material data when dialog closes
        if (!isOpen) {
            setMaterialData(null)
            // Reset action state? Usually handled by form reset or re-render
        }
    }, [isOpen, materialId, materialData, toast])

    // Show toast based on form submission state
    useEffect(() => {
        if (state.message && !state.errors?.code && !state.errors?.name && !state.errors?.description && !state.errors?.referenceCode) {
            // Success message
            toast({ title: 'Éxito', description: state.message })
            setIsOpen(false) // Close dialog on success
        } else if (state.message && (state.errors?.code || state.errors?.name || state.errors?.description || state.errors?.referenceCode)) {
            // Validation or other error message
            toast({ title: 'Error de Validación', description: state.message, variant: 'destructive' })
        }
    }, [state, toast])

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar Material</DialogTitle>
                    <DialogDescription>
                        Modifica los detalles del material. Haz clic en guardar cuando termines.
                    </DialogDescription>
                </DialogHeader>
                {isLoading && (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <span className="ml-2">Cargando datos...</span>
                    </div>
                )}
                {errorLoading && !isLoading && (
                    <p className="text-center text-destructive p-4">{errorLoading}</p>
                )}
                {!isLoading && !errorLoading && materialData && (
                    <form action={formAction}>
                        <input type="hidden" name="id" value={materialData.id} />
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="code" className="text-right">
                                    Código
                                </Label>
                                <Input
                                    id="code"
                                    name="code"
                                    defaultValue={materialData.code}
                                    className="col-span-3"
                                    aria-describedby="code-error"
                                    required
                                />
                                {state.errors?.code && (
                                    <p id="code-error" className="col-span-4 text-sm text-destructive text-right">
                                        {state.errors.code.join(', ')}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                    Nombre
                                </Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={materialData.name}
                                    className="col-span-3"
                                    aria-describedby="name-error"
                                    required
                                />
                                {state.errors?.name && (
                                    <p id="name-error" className="col-span-4 text-sm text-destructive text-right">
                                        {state.errors.name.join(', ')}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="referenceCode" className="text-right">
                                    Ref. Proveedor
                                </Label>
                                <Input
                                    id="referenceCode"
                                    name="referenceCode"
                                    defaultValue={materialData.referenceCode || ''}
                                    className="col-span-3"
                                    aria-describedby="referenceCode-error"
                                />
                                {state.errors?.referenceCode && (
                                    <p id="referenceCode-error" className="col-span-4 text-sm text-destructive text-right">
                                        {state.errors.referenceCode.join(', ')}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="description" className="text-right">
                                    Descripción
                                </Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    defaultValue={materialData.description || ''}
                                    className="col-span-3"
                                    rows={3}
                                    aria-describedby="description-error"
                                />
                                {state.errors?.description && (
                                    <p id="description-error" className="col-span-4 text-sm text-destructive text-right">
                                        {state.errors.description.join(', ')}
                                    </p>
                                )}
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="secondary" disabled={isPending}>
                                    Cancelar
                                </Button>
                            </DialogClose>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Cambios'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
} 