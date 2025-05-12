"use server"

import { prisma } from "@/lib/db"
import { unstable_noStore as noStore } from 'next/cache'
import { ProviderType } from '@/generated/prisma' // Assuming alias is correct
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getSuppliers() {
    noStore() // Opt out of caching for this dynamic data
    try {
        const suppliers = await prisma.provider.findMany({
            include: {
                _count: {
                    select: {
                        invoices: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        return { suppliers }
    } catch (error) {
        console.error('Database Error:', error)
        throw new Error('Failed to fetch suppliers.')
    }
}

// Zod schema for validation
const CreateSupplierSchema = z.object({
    name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
    // Ensure ProviderType enum is correctly imported and used
    type: z.nativeEnum(ProviderType, { errorMap: () => ({ message: 'Selecciona un tipo de proveedor válido.' }) }),
    cif: z.string()
        .regex(/^[A-HJNP-SUVW]{1}\d{7}[0-9A-J]$/, 'Formato de CIF inválido.') // Basic Spanish CIF format regex
        .min(9, 'El CIF debe tener 9 caracteres.')
        .max(9, 'El CIF debe tener 9 caracteres.'),
    email: z.string().email('Email inválido.').optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')), // Add more specific phone validation if needed
    address: z.string().max(200, 'La dirección no puede exceder los 200 caracteres.').optional().or(z.literal('')),
})

// Type for state returned by useActionState
export type SupplierFormState = {
    message: string
    errors?: {
        name?: string[]
        type?: string[]
        cif?: string[]
        email?: string[]
        phone?: string[]
        address?: string[]
    }
}

// Server Action: createSupplier
export async function createSupplier(
    prevState: SupplierFormState,
    formData: FormData
): Promise<SupplierFormState> {
    const validatedFields = CreateSupplierSchema.safeParse(
        Object.fromEntries(formData.entries())
    )

    if (!validatedFields.success) {
        console.log('Validation Errors:', validatedFields.error.flatten().fieldErrors)
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Error de validación. Por favor, corrige los campos marcados.',
        }
    }

    const { name, type, cif, email, phone, address } = validatedFields.data

    try {
        // Check if CIF already exists
        const existingProvider = await prisma.provider.findUnique({
            where: { cif },
        })

        if (existingProvider) {
            return {
                errors: { cif: ['Este CIF ya está registrado.'] },
                message: 'Error: El CIF ya existe.',
            }
        }

        await prisma.provider.create({
            data: {
                name,
                type,
                cif,
                email: email || null,
                phone: phone || null,
                address: address || null,
            },
        })

        revalidatePath('/proveedores') // Revalidate the suppliers page
        return { message: 'Proveedor creado exitosamente.', errors: {} }

    } catch (error) {
        console.error('Database Error creating supplier:', error)
        return {
            message: 'Error de base de datos al crear el proveedor.',
            errors: {}, // Avoid exposing detailed db errors
        }
    }
}



