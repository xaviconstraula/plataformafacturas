"use server"

import { prisma } from "@/lib/db"
import { unstable_noStore as noStore } from 'next/cache'
import { ProviderType } from '@/generated/prisma' // Assuming alias is correct
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type PrismaClient } from "@prisma/client"
import { type Provider } from "@/generated/prisma"

export async function getSuppliers() {
    noStore() // Opt out of caching for this dynamic data
    try {
        const suppliers = await prisma.provider.findMany({
            select: {
                id: true,
                name: true,
                type: true,
                email: true,
                phone: true,
                address: true,
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

        // Check for duplicates using phone number if available - treat as same provider
        if (phone) {
            const duplicateByPhone = await prisma.provider.findFirst({
                where: { phone: phone },
            });

            if (duplicateByPhone) {
                return {
                    errors: {
                        phone: [`Ya existe un proveedor con este teléfono (${duplicateByPhone.name}, CIF: ${duplicateByPhone.cif}). Es el mismo proveedor.`]
                    },
                    message: 'Proveedor duplicado: ya existe un proveedor con este número de teléfono.',
                }
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

export async function deleteProviderAction(providerId: string) {
    if (!providerId) {
        return { success: false, message: "ID de proveedor no proporcionado." };
    }

    try {
        await prisma.provider.delete({
            where: { id: providerId },
        });

        revalidatePath("/proveedores");
        return { success: true, message: "Proveedor eliminado correctamente." };
    } catch (error) {
        console.error("Error deleting provider:", error);
        if (error instanceof Error) {
            if ('code' in error && error.code === 'P2025') {
                revalidatePath("/proveedores");
                return { success: false, message: "El proveedor no existe o ya ha sido eliminado." };
            }
            if ('code' in error && error.code === 'P2003') {
                return { success: false, message: "No se puede eliminar el proveedor porque tiene facturas asociadas." };
            }
        }
        return { success: false, message: "Error al eliminar el proveedor." };
    }
}

export async function editProviderAction(providerId: string, data: {
    name: string;
    type: ProviderType;
    cif: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
}) {
    if (!providerId) {
        return { success: false, message: "ID de proveedor no proporcionado." };
    }

    try {
        // Check if CIF already exists for a different provider
        const existingProvider = await prisma.provider.findUnique({
            where: { cif: data.cif },
        })

        if (existingProvider && existingProvider.id !== providerId) {
            return {
                success: false,
                message: "Este CIF ya está registrado por otro proveedor."
            };
        }

        await prisma.provider.update({
            where: { id: providerId },
            data: {
                name: data.name,
                type: data.type,
                cif: data.cif,
                email: data.email,
                phone: data.phone,
                address: data.address,
            },
        });

        revalidatePath("/proveedores");
        return { success: true, message: "Proveedor actualizado correctamente." };
    } catch (error) {
        console.error("Error updating provider:", error);
        if (error instanceof Error) {
            if ('code' in error && error.code === 'P2025') {
                return { success: false, message: "El proveedor no existe." };
            }
            if ('code' in error && error.code === 'P2003') {
                return { success: false, message: "Error: Violación de restricción única (CIF duplicado)." };
            }
        }
        return { success: false, message: "Error al actualizar el proveedor." };
    }
}



