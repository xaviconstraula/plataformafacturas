'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { ProviderType } from '@/generated/prisma'
import { createSupplier } from '@/lib/actions/proveedores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

// Type mapping for display
const providerTypeMap: Record<ProviderType, string> = {
    MATERIAL_SUPPLIER: 'Proveedor de Materiales',
    MACHINERY_RENTAL: 'Proveedor de Maquinaria',
}

const providerTypes = Object.keys(providerTypeMap) as ProviderType[]

// Helper Submit Button
function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {label}
        </Button>
    )
}

type SupplierFormProps = {
    onSuccess: () => void
}

export function SupplierForm({ onSuccess }: SupplierFormProps) {
    const initialState = { message: '', errors: {} }
    const [state, formAction] = useActionState(createSupplier, initialState)

    useEffect(() => {
        if (
            state.message === 'Proveedor creado exitosamente.' &&
            (!state.errors || Object.keys(state.errors).length === 0)
        ) {
            onSuccess()
        }
    }, [state, onSuccess])

    return (
        <form action={formAction} className="grid gap-4">
            {/* Display general form message / non-field error */}
            {state?.message && state.message !== 'Proveedor creado exitosamente.' && (
                <p className="text-sm font-medium text-destructive">{state.message}</p>
            )}

            {/* Name Field */}
            <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input id="name" name="name" placeholder="Nombre del proveedor" required aria-describedby="name-error" />
                {state.errors?.name && (
                    <p id="name-error" className="text-sm font-medium text-destructive">
                        {state.errors.name[0]}
                    </p>
                )}
            </div>

            {/* CIF Field */}
            <div className="grid gap-2">
                <Label htmlFor="cif">CIF *</Label>
                <Input id="cif" name="cif" placeholder="A12345678" required aria-describedby="cif-error" />
                {state.errors?.cif && (
                    <p id="cif-error" className="text-sm font-medium text-destructive">
                        {state.errors.cif[0]}
                    </p>
                )}
            </div>

            {/* Provider Type Field */}
            <div className="grid gap-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select name="type" required defaultValue={providerTypes[0]}> {/* Set a default value */}
                    <SelectTrigger id="type" aria-describedby="type-error">
                        <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        {providerTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                                {providerTypeMap[type]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {state.errors?.type && (
                    <p id="type-error" className="text-sm font-medium text-destructive">
                        {state.errors.type[0]}
                    </p>
                )}
            </div>

            {/* Email Field (Optional) */}
            <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="contacto@ejemplo.com" aria-describedby="email-error" />
                {state.errors?.email && (
                    <p id="email-error" className="text-sm font-medium text-destructive">
                        {state.errors.email[0]}
                    </p>
                )}
            </div>

            {/* Phone Field (Optional) */}
            <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" name="phone" placeholder="+34 600 123 456" aria-describedby="phone-error" />
                {state.errors?.phone && (
                    <p id="phone-error" className="text-sm font-medium text-destructive">
                        {state.errors.phone[0]}
                    </p>
                )}
            </div>

            {/* Address Field (Optional) */}
            <div className="grid gap-2">
                <Label htmlFor="address">Dirección</Label>
                <Textarea id="address" name="address" placeholder="Calle Falsa 123, Ciudad" aria-describedby="address-error" />
                {state.errors?.address && (
                    <p id="address-error" className="text-sm font-medium text-destructive">
                        {state.errors.address[0]}
                    </p>
                )}
            </div>

            <SubmitButton label="Crear Proveedor" />
        </form>
    )
}
