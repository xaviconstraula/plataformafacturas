'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createMaterial } from '@/lib/actions/materiales' // Action to be created
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'

// Helper Submit Button (can be shared, but included here for simplicity)
function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {label}
        </Button>
    )
}

type MaterialFormProps = {
    onSuccess: () => void
}

export function MaterialForm({ onSuccess }: MaterialFormProps) {
    const initialState = { message: '', errors: {} }
    const [state, formAction] = useActionState(createMaterial, initialState)

    useEffect(() => {
        if (
            state.message === 'Material creado exitosamente.' &&
            (!state.errors || Object.keys(state.errors).length === 0)
        ) {
            onSuccess()
        }
    }, [state, onSuccess])

    return (
        <form action={formAction} className="grid gap-4">
            {/* Display general form message / non-field error */}
            {state?.message && state.message !== 'Material creado exitosamente.' && (
                <p className="text-sm font-medium text-destructive">{state.message}</p>
            )}

            {/* Code Field */}
            <div className="grid gap-2">
                <Label htmlFor="code">Código *</Label>
                <Input id="code" name="code" placeholder="Ej: MAT001" required aria-describedby="code-error" />
                {state.errors?.code && (
                    <p id="code-error" className="text-sm font-medium text-destructive">
                        {state.errors.code[0]}
                    </p>
                )}
            </div>

            {/* Name Field */}
            <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input id="name" name="name" placeholder="Nombre del material" required aria-describedby="name-error" />
                {state.errors?.name && (
                    <p id="name-error" className="text-sm font-medium text-destructive">
                        {state.errors.name[0]}
                    </p>
                )}
            </div>

            {/* Description Field (Optional) */}
            <div className="grid gap-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea id="description" name="description" placeholder="Descripción detallada del material" aria-describedby="description-error" />
                {state.errors?.description && (
                    <p id="description-error" className="text-sm font-medium text-destructive">
                        {state.errors.description[0]}
                    </p>
                )}
            </div>

            {/* Unit field is removed as requested */}

            <SubmitButton label="Crear Material" />
        </form>
    )
}
