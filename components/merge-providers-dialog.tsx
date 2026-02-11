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
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { toast } from 'sonner'
import { Loader2, Link2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ProviderOption {
    id: string
    name: string
    cif: string
}

interface MergeProvidersDialogProps {
    providers: ProviderOption[]
}

export function MergeProvidersDialog({ providers }: MergeProvidersDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [sourceId, setSourceId] = useState<string>('')
    const [targetId, setTargetId] = useState<string>('')
    const [isPending, setIsPending] = useState(false)

    const router = useRouter()

    const handleMerge = async () => {
        if (!sourceId || !targetId || sourceId === targetId) return
        setIsPending(true)
        try {
            const res = await fetch('/api/providers/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceProviderId: sourceId, targetProviderId: targetId })
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
                setIsOpen(false)
                router.refresh()
            } else {
                toast.error(data.message || 'Error al fusionar proveedores')
            }
        } catch (error) {
            console.error('Merge providers error:', error)
            toast.error('Error inesperado al fusionar proveedores')
        } finally {
            setIsPending(false)
        }
    }

    // Helper to render select options label
    const optionLabel = (p?: ProviderOption) => p ? `${p.name} (${p.cif})` : ''

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary">
                    <Link2Icon className="mr-2 h-4 w-4" />
                    Fusionar Proveedores
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[min(600px,100vh-4rem)] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Fusionar registros duplicados</DialogTitle>
                    <DialogDescription>
                        Selecciona el proveedor duplicado y el proveedor correcto al que se migrarán los datos. Esta acción no se puede deshacer.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Proveedor duplicado</Label>
                        <SearchableSelect
                            value={sourceId}
                            onValueChange={setSourceId}
                            placeholder="Selecciona proveedor duplicado"
                            searchPlaceholder="Buscar proveedor..."
                            options={providers
                                .filter((p) => p.id !== targetId)
                                .map((p) => ({
                                    value: p.id,
                                    label: optionLabel(p),
                                }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Proveedor correcto</Label>
                        <SearchableSelect
                            value={targetId}
                            onValueChange={setTargetId}
                            placeholder="Selecciona proveedor destino"
                            searchPlaceholder="Buscar proveedor..."
                            options={providers
                                .filter((p) => p.id !== sourceId)
                                .map((p) => ({
                                    value: p.id,
                                    label: optionLabel(p),
                                }))}
                        />
                    </div>
                    {sourceId && targetId && sourceId === targetId && (
                        <p className="text-xs text-destructive">El proveedor duplicado y el destino no pueden ser el mismo.</p>
                    )}
                    {sourceId && targetId && sourceId !== targetId && (
                        <p className="text-xs text-muted-foreground">Se eliminará <strong>{optionLabel(providers.find(p => p.id === sourceId))}</strong> después de transferir sus datos.</p>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleMerge} disabled={!sourceId || !targetId || sourceId === targetId || isPending} variant="destructive">
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Fusionar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 