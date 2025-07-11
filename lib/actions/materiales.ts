"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getMaterials() {
    // Removed noStore() - materials don't change frequently, caching is beneficial
    try {
        const materials = await prisma.material.findMany({
            include: {
                _count: {
                    select: {
                        invoiceItems: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        return { materials }
    } catch (error) {
        console.error('Database Error:', error)
        throw new Error('Failed to fetch materials.')
    }
}

// Zod schema for validation
const CreateMaterialSchema = z.object({
    code: z.string().min(1, 'El código es obligatorio.').max(50, 'El código no puede exceder los 50 caracteres.'),
    name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.').max(100, 'El nombre no puede exceder los 100 caracteres.'),
    referenceCode: z.string().max(50, 'La referencia no puede exceder los 50 caracteres.').optional().or(z.literal('')),
    description: z.string().max(500, 'La descripción no puede exceder los 500 caracteres.').optional().or(z.literal('')),
})

// Zod schema for validation for updating
// Code is often not updatable or has special considerations. For now, we'll include it.
// If code should not be updatable, it can be removed from this schema or made read-only in the form.
const UpdateMaterialSchema = CreateMaterialSchema.extend({
    id: z.string().min(1, "ID de material es obligatorio."), // Assuming ID is passed for update
});

// Type for state returned by useActionState
export type MaterialFormState = {
    message: string
    errors?: {
        code?: string[]
        name?: string[]
        referenceCode?: string[]
        description?: string[]
    }
}

// Server Action: createMaterial
export async function createMaterial(
    prevState: MaterialFormState,
    formData: FormData
): Promise<MaterialFormState> {
    const validatedFields = CreateMaterialSchema.safeParse(
        Object.fromEntries(formData.entries())
    )

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Error de validación. Por favor, corrige los campos marcados.',
        }
    }

    const { code, name, description, referenceCode } = validatedFields.data

    try {
        // Check if code already exists
        const existingMaterial = await prisma.material.findUnique({
            where: { code },
        })

        if (existingMaterial) {
            return {
                errors: { code: ['Este código de material ya está registrado.'] },
                message: 'Error: El código de material ya existe.',
            }
        }

        await prisma.material.create({
            data: {
                code,
                name,
                description: description || null,
                referenceCode: referenceCode || null,
            },
        })

        revalidatePath('/materiales') // Revalidate the materials page
        return { message: 'Material creado exitosamente.', errors: {} }

    } catch (error) {
        console.error('Database Error creating material:', error)
        // Consider if error is PrismaClientKnownRequestError and P2002 for unique constraint on 'code'
        // For now, a general message:
        return {
            message: 'Error de base de datos al crear el material.',
            errors: {},
        }
    }
}

// Server Action: getMaterialById
export async function getMaterialById(id: string) {
    // Removed noStore(); // Opt out of caching for this specific query if needed for fresh data
    try {
        const material = await prisma.material.findUnique({
            where: { id },
        });
        if (!material) {
            // Consider how to handle not found, maybe return null or throw specific error
            return { material: null, error: "Material no encontrado." };
        }
        return { material };
    } catch (error) {
        console.error('Database Error:', error);
        // It's good practice to not expose raw error messages to the client
        throw new Error('Failed to fetch material.');
    }
}

// Server Action: updateMaterial
export async function updateMaterial(
    prevState: MaterialFormState,
    formData: FormData
): Promise<MaterialFormState> {
    const validatedFields = UpdateMaterialSchema.safeParse(
        Object.fromEntries(formData.entries())
    );

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Error de validación. Por favor, corrige los campos marcados.',
        };
    }

    const { id, code, name, description, referenceCode } = validatedFields.data;

    try {
        // Optional: Check if the new code (if changeable) conflicts with another existing material, excluding the current one.
        const existingMaterialWithCode = await prisma.material.findFirst({
            where: {
                code,
                NOT: { id }, // Exclude the current material from the check
            },
        });

        if (existingMaterialWithCode) {
            return {
                errors: { code: ['Este código de material ya está en uso por otro material.'] },
                message: 'Error: El código de material ya existe.',
            };
        }

        await prisma.material.update({
            where: { id },
            data: {
                code,
                name,
                description: description || null,
                referenceCode: referenceCode || null,
            },
        });

        revalidatePath('/materiales'); // Revalidate the materials page
        revalidatePath(`/materiales/${id}`); // Revalidate specific material page if one exists
        return { message: 'Material actualizado exitosamente.', errors: {} };

    } catch (error) {
        console.error('Database Error updating material:', error);
        // Handle potential errors, e.g., Prisma P2025 (Record to update not found)
        return {
            message: 'Error de base de datos al actualizar el material.',
            errors: {},
        };
    }
}

// Server Action: deleteMaterial
export async function deleteMaterial(id: string): Promise<{ success: boolean; message: string }> {
    if (!id) {
        return { success: false, message: "ID de material es obligatorio." };
    }
    try {
        // Optional: Check if the material is associated with any invoice items
        const invoiceItemsCount = await prisma.invoiceItem.count({
            where: { materialId: id },
        });

        if (invoiceItemsCount > 0) {
            return {
                success: false,
                message: 'Este material no se puede eliminar porque está asociado a una o más facturas. Por favor, elimina primero las facturas asociadas o desvincula el material.',
            };
        }

        await prisma.material.delete({
            where: { id },
        });

        revalidatePath('/materiales');
        return { success: true, message: 'Material eliminado exitosamente.' };

    } catch (error) {
        console.error('Database Error deleting material:', error);
        // Handle potential errors, e.g., Prisma P2025 (Record to delete not found)
        // Or P2003 (Foreign key constraint failed - though we checked above)
        return { success: false, message: 'Error de base de datos al eliminar el material.' };
    }
}



