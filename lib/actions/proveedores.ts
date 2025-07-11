"use server"

import { prisma } from "@/lib/db"
import { ProviderType } from '@/generated/prisma' // Assuming alias is correct
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type PrismaClient } from "@prisma/client"
import { type Provider } from "@/generated/prisma"

export async function getSuppliers() {
    // Removed noStore() - providers don't change frequently, caching is beneficial
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

/**
 * Fusiona dos proveedores combinando todas las relaciones (facturas, materiales, alertas…)
 * sobre el proveedor destino y elimina el proveedor origen.
 * @param sourceProviderId  ID del proveedor que se desea fusionar (se eliminará)
 * @param targetProviderId  ID del proveedor que se mantiene y recibirá todos los registros
 */
export async function mergeProvidersAction(sourceProviderId: string, targetProviderId: string) {
    if (!sourceProviderId || !targetProviderId) {
        return { success: false, message: "Debes indicar proveedor origen y destino." }
    }

    if (sourceProviderId === targetProviderId) {
        return { success: false, message: "El proveedor origen y destino no pueden ser el mismo." }
    }

    try {
        await prisma.$transaction(async (tx) => {
            /* Validaciones previas: comprobar facturas y alertas duplicadas */
            const sourceInvoices = await tx.invoice.findMany({
                where: { providerId: sourceProviderId },
                select: { id: true, invoiceCode: true }
            })

            const duplicateInvoiceCodes = await tx.invoice.findMany({
                where: {
                    providerId: targetProviderId,
                    invoiceCode: { in: sourceInvoices.map(i => i.invoiceCode) }
                },
                select: { invoiceCode: true }
            })

            if (duplicateInvoiceCodes.length > 0) {
                throw new Error(`Se encontraron códigos de factura duplicados: ${duplicateInvoiceCodes.map(d => d.invoiceCode).join(', ')}`)
            }

            const sourceAlerts = await tx.priceAlert.findMany({
                where: { providerId: sourceProviderId },
                select: { id: true, materialId: true, effectiveDate: true }
            })

            for (const alert of sourceAlerts) {
                const exists = await tx.priceAlert.findFirst({
                    where: {
                        providerId: targetProviderId,
                        materialId: alert.materialId,
                        effectiveDate: alert.effectiveDate
                    },
                    select: { id: true }
                })
                if (exists) {
                    // Eliminar alerta duplicada del origen para evitar conflicto
                    await tx.priceAlert.delete({ where: { id: alert.id } })
                }
            }

            /* 1. Actualizar facturas */
            await tx.invoice.updateMany({
                where: { providerId: sourceProviderId },
                data: { providerId: targetProviderId },
            })

            /* 2. Actualizar alertas de precio */
            await tx.priceAlert.updateMany({
                where: { providerId: sourceProviderId },
                data: { providerId: targetProviderId },
            })

            /* 3. Fusionar registros MaterialProvider manejando posibles duplicados */
            const sourceMaterialProviders = await tx.materialProvider.findMany({
                where: { providerId: sourceProviderId },
            })

            for (const mp of sourceMaterialProviders) {
                const existing = await tx.materialProvider.findUnique({
                    where: {
                        materialId_providerId: {
                            materialId: mp.materialId,
                            providerId: targetProviderId,
                        },
                    },
                })

                if (existing) {
                    // Si ya existe un registro para este material + proveedor destino, decidir si se actualiza el precio
                    if (
                        mp.lastPriceDate &&
                        (!existing.lastPriceDate || mp.lastPriceDate > existing.lastPriceDate)
                    ) {
                        await tx.materialProvider.update({
                            where: { id: existing.id },
                            data: {
                                lastPrice: mp.lastPrice,
                                lastPriceDate: mp.lastPriceDate,
                            },
                        })
                    }
                    // Eliminar el registro duplicado del proveedor origen
                    await tx.materialProvider.delete({ where: { id: mp.id } })
                } else {
                    // No existe duplicado; simplemente actualizamos el providerId
                    await tx.materialProvider.update({
                        where: { id: mp.id },
                        data: { providerId: targetProviderId },
                    })
                }
            }

            /* 4. Transferir información de contacto faltante del proveedor origen al destino */
            const [sourceProvider, targetProvider] = await Promise.all([
                tx.provider.findUnique({ where: { id: sourceProviderId } }),
                tx.provider.findUnique({ where: { id: targetProviderId } }),
            ])

            if (sourceProvider && targetProvider) {
                const dataToUpdate: Record<string, unknown> = {}

                if (!targetProvider.email && sourceProvider.email) dataToUpdate.email = sourceProvider.email
                if (!targetProvider.phone && sourceProvider.phone) dataToUpdate.phone = sourceProvider.phone
                if (!targetProvider.address && sourceProvider.address) dataToUpdate.address = sourceProvider.address

                if (Object.keys(dataToUpdate).length > 0) {
                    await tx.provider.update({
                        where: { id: targetProviderId },
                        data: dataToUpdate,
                    })
                }
            }

            /* 5. Crear alias CIF del proveedor origen → destino */
            if (sourceProvider?.cif) {
                await tx.providerAlias.upsert({
                    where: { cif: sourceProvider.cif },
                    update: { providerId: targetProviderId },
                    create: { cif: sourceProvider.cif, providerId: targetProviderId },
                })
            }

            /* 6. Eliminar el proveedor origen */
            await tx.provider.delete({ where: { id: sourceProviderId } })
        })

        // Revalidate list and both detail pages
        revalidatePath('/proveedores')
        revalidatePath(`/proveedores/${targetProviderId}`)
        return { success: true, message: 'Proveedores fusionados correctamente.' }
    } catch (error) {
        console.error('Error merging providers:', error)
        return { success: false, message: 'Error al fusionar proveedores.' }
    }
}



