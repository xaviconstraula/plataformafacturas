"use client"

import { useState, useEffect } from "react"
import { useActionState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateMaterial, type MaterialFormState } from "@/lib/actions/materiales"
import { useMaterial } from "@/hooks/use-analytics"
import { useToast } from "@/hooks/use-toast"
import type { Material } from "@/generated/prisma"

interface EditMaterialDialogProps {
    materialId: string
    children: React.ReactNode
}

const initialState: MaterialFormState = { message: '', errors: {} }

export function EditMaterialDialog({ materialId, children }: EditMaterialDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { toast } = useToast()
    const [state, formAction, isPending] = useActionState(updateMaterial, initialState)

    // Use TanStack Query to fetch material data
    const {
        data: materialData,
        isLoading,
        error
    } = useMaterial(isOpen ? materialId : null)

    // Handle form submission success
    useEffect(() => {
        if (state.message && !state.errors) {
            toast({ title: 'Éxito', description: state.message })
            setIsOpen(false)
        }
    }, [state.message, state.errors, toast])

    // Handle errors
    useEffect(() => {
        if (error) {
            toast({
                title: 'Error',
                description: error.message || 'No se pudo cargar el material.',
                variant: 'destructive'
            })
        }
    }, [error, toast])

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Material</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    {isLoading && (
                        <div className="space-y-4">
                            <div className="h-4 bg-muted animate-pulse rounded"></div>
                            <div className="h-4 bg-muted animate-pulse rounded"></div>
                            <div className="h-4 bg-muted animate-pulse rounded"></div>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-4 text-muted-foreground">
                            <p>Error al cargar el material</p>
                            <p className="text-sm">{error.message}</p>
                        </div>
                    )}

                    {materialData && (
                        <form action={formAction} className="space-y-4">
                            <input type="hidden" name="id" value={materialData.id} />

                            <div>
                                <Label htmlFor="name">Nombre *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={materialData.name}
                                    placeholder="Nombre del material"
                                    required
                                />
                                {state.errors?.name && (
                                    <p className="text-sm text-destructive mt-1">{state.errors.name}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="code">Código</Label>
                                <Input
                                    id="code"
                                    name="code"
                                    defaultValue={materialData.code}
                                    placeholder="Código del material"
                                />
                                {state.errors?.code && (
                                    <p className="text-sm text-destructive mt-1">{state.errors.code}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="category">Categoría</Label>
                                <Input
                                    id="category"
                                    name="category"
                                    defaultValue={materialData.category || ''}
                                    placeholder="Categoría del material"
                                />
                            </div>

                            <div>
                                <Label htmlFor="unit">Unidad</Label>
                                <Select name="unit" defaultValue={materialData.unit || ''}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona una unidad" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="kg">Kilogramo (kg)</SelectItem>
                                        <SelectItem value="g">Gramo (g)</SelectItem>
                                        <SelectItem value="l">Litro (l)</SelectItem>
                                        <SelectItem value="ml">Mililitro (ml)</SelectItem>
                                        <SelectItem value="m">Metro (m)</SelectItem>
                                        <SelectItem value="cm">Centímetro (cm)</SelectItem>
                                        <SelectItem value="mm">Milímetro (mm)</SelectItem>
                                        <SelectItem value="m2">Metro cuadrado (m²)</SelectItem>
                                        <SelectItem value="m3">Metro cúbico (m³)</SelectItem>
                                        <SelectItem value="pcs">Piezas (pcs)</SelectItem>
                                        <SelectItem value="ud">Unidades (ud)</SelectItem>
                                        <SelectItem value="pack">Paquete (pack)</SelectItem>
                                        <SelectItem value="caja">Caja</SelectItem>
                                        <SelectItem value="saco">Saco</SelectItem>
                                        <SelectItem value="bidón">Bidón</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="description">Descripción</Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    defaultValue={materialData.description || ''}
                                    placeholder="Descripción del material"
                                    rows={3}
                                />
                                {state.errors?.description && (
                                    <p className="text-sm text-destructive mt-1">{state.errors.description}</p>
                                )}
                            </div>

                            {state.message && state.errors && (
                                <div className="text-sm text-destructive">{state.message}</div>
                            )}

                            <div className="flex justify-end space-x-2">
                                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? 'Guardando...' : 'Guardar'}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
} 