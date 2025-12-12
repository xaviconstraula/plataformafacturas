"use server"

import { prisma } from "@/lib/db"
import { Prisma, ProviderType } from "@/generated/prisma"
import { revalidatePath } from "next/cache"
import { normalizeSearch, processWorkOrderSearch } from "@/lib/utils"
import { requireAuth } from "@/lib/auth-utils"

// Type for invoice items without material (when includeItems is false)
type InvoiceItemWithoutMaterial = {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    materialId: string;
    invoiceId: string;
    description: string | null;
    quantity: Prisma.Decimal;
    listPrice: Prisma.Decimal | null;
    discountPercentage: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
    itemDate: Date;
    workOrder: string | null;
    lineNumber: number | null;
};

// Type for invoice items with material (when includeItems is true)
type InvoiceItemWithMaterial = InvoiceItemWithoutMaterial & {
    material: {
        id: string;
        code: string;
        name: string;
        category: string | null;
        unit: string | null;
        productGroup: {
            id: string;
            standardizedName: string;
        } | null;
    };
};

// Type guard to check if item has material
function hasMaterial(item: InvoiceItemWithoutMaterial | InvoiceItemWithMaterial): item is InvoiceItemWithMaterial {
    return 'material' in item;
}

export interface GetInvoicesParams {
    page?: number
    pageSize?: number
    month?: string
    quarter?: string
    year?: string
    supplier?: string
    search?: string
    workOrder?: string
    material?: string
    minAmount?: number
    maxAmount?: number
    minUnitPrice?: number
    maxUnitPrice?: number
    fiscalYear?: string
    category?: string
    includeItems?: boolean
}

const DEFAULT_PAGE_SIZE = 15

export async function getInvoices(params: GetInvoicesParams) {
    const user = await requireAuth()

    try {
        const page = params.page || 1
        const pageSize = params.pageSize || DEFAULT_PAGE_SIZE
        const skip = (page - 1) * pageSize

        // Clean up filter parameters - treat "all" as undefined
        const cleanYear = params.year && params.year !== 'all' ? params.year : undefined
        const cleanMonth = params.month && params.month !== 'all' ? params.month : undefined
        const cleanQuarter = params.quarter && params.quarter !== 'all' ? params.quarter : undefined
        const cleanFiscalYear = params.fiscalYear && params.fiscalYear !== 'all' ? params.fiscalYear : undefined
        const cleanSupplier = params.supplier && params.supplier !== 'all' ? params.supplier : undefined
        const cleanMaterial = params.material && params.material !== 'all' ? params.material : undefined
        const cleanCategory = params.category && params.category !== 'all' ? params.category : undefined

        // Normalize search parameters
        const normalizedSearch = normalizeSearch(params.search)
        const normalizedWorkOrder = processWorkOrderSearch(params.workOrder)
        const normalizedCategory = normalizeSearch(cleanCategory)

        let dateFilter: Prisma.InvoiceWhereInput = {}

        if (cleanFiscalYear) {
            const fiscalYear = parseInt(cleanFiscalYear)
            dateFilter = {
                issueDate: {
                    gte: new Date(`${fiscalYear}-01-01`),
                    lte: new Date(`${fiscalYear}-12-31`)
                }
            }
        } else if (cleanYear) {
            const year = parseInt(cleanYear)
            if (cleanQuarter) {
                const quarter = parseInt(cleanQuarter)
                const quarterStart = new Date(year, (quarter - 1) * 3, 1)
                const quarterEnd = new Date(year, quarter * 3, 0)
                dateFilter = {
                    issueDate: {
                        gte: quarterStart,
                        lte: quarterEnd
                    }
                }
            } else if (cleanMonth) {
                const month = parseInt(cleanMonth)
                const monthStart = new Date(year, month - 1, 1)
                const monthEnd = new Date(year, month, 0)
                dateFilter = {
                    issueDate: {
                        gte: monthStart,
                        lte: monthEnd
                    }
                }
            } else {
                dateFilter = {
                    issueDate: {
                        gte: new Date(`${year}-01-01`),
                        lte: new Date(`${year}-12-31`)
                    }
                }
            }
        }

        let amountFilter: Prisma.InvoiceWhereInput = {}
        if (params.minAmount !== undefined || params.maxAmount !== undefined) {
            amountFilter = {
                totalAmount: {
                    ...(params.minAmount !== undefined ? { gte: params.minAmount } : {}),
                    ...(params.maxAmount !== undefined ? { lte: params.maxAmount } : {})
                }
            }
        }

        const where: Prisma.InvoiceWhereInput = {
            ...dateFilter,
            ...amountFilter,
            // Filter by user's providers only
            provider: {
                userId: user.id,
                ...(cleanSupplier ? { id: cleanSupplier } : {})
            },
            ...(normalizedSearch ? {
                OR: [
                    { invoiceCode: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive } },
                    {
                        provider: {
                            name: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive },
                            userId: user.id
                        }
                    },
                    {
                        items: {
                            some: {
                                material: {
                                    name: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive },
                                    userId: user.id
                                }
                            }
                        }
                    }
                ]
            } : {}),
            ...(normalizedWorkOrder ? {
                items: {
                    some: {
                        workOrder: { contains: normalizedWorkOrder, mode: Prisma.QueryMode.insensitive },
                        material: { userId: user.id }
                    }
                }
            } : {}),
            ...(cleanMaterial ? {
                items: {
                    some: {
                        materialId: cleanMaterial,
                        material: { userId: user.id }
                    }
                }
            } : {}),
            ...(normalizedCategory ? {
                items: {
                    some: {
                        material: {
                            category: { contains: normalizedCategory, mode: Prisma.QueryMode.insensitive },
                            userId: user.id
                        }
                    }
                }
            } : {}),
            ...((params.minUnitPrice !== undefined || params.maxUnitPrice !== undefined) ? {
                items: {
                    some: {
                        unitPrice: {
                            ...(params.minUnitPrice !== undefined ? { gte: params.minUnitPrice } : {}),
                            ...(params.maxUnitPrice !== undefined ? { lte: params.maxUnitPrice } : {})
                        },
                        material: { userId: user.id }
                    }
                }
            } : {})
        }

        const [totalCount, invoices] = await Promise.all([
            prisma.invoice.count({ where }),
            prisma.invoice.findMany({
                where,
                skip,
                take: pageSize,
                select: {
                    id: true,
                    invoiceCode: true,
                    issueDate: true,
                    totalAmount: true,
                    hasTotalsMismatch: true,
                    provider: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            cif: true,
                        }
                    },
                    ...(params.includeItems ? {
                        items: {
                            select: {
                                id: true,
                                quantity: true,
                                listPrice: true,
                                discountPercentage: true,
                                unitPrice: true,
                                totalPrice: true,
                                workOrder: true,
                                description: true,
                                lineNumber: true,
                                itemDate: true,
                                material: {
                                    select: {
                                        id: true,
                                        code: true,
                                        name: true,
                                        category: true,
                                        unit: true,
                                        productGroup: {
                                            select: {
                                                id: true,
                                                standardizedName: true,
                                            }
                                        }
                                    }
                                }
                            },
                            orderBy: [
                                { lineNumber: 'asc' },
                                { createdAt: 'asc' }
                            ]
                        }
                    } : {
                        items: {
                            select: {
                                id: true,
                                quantity: true,
                                listPrice: true,
                                discountPercentage: true,
                                unitPrice: true,
                                totalPrice: true,
                                workOrder: true,
                                description: true,
                                lineNumber: true,
                                itemDate: true,
                            },
                            orderBy: [
                                { lineNumber: 'asc' },
                                { createdAt: 'asc' }
                            ]
                        }
                    })
                },
                orderBy: {
                    createdAt: 'desc'
                }
            }) as Promise<Array<{
                id: string;
                invoiceCode: string;
                issueDate: Date;
                totalAmount: Prisma.Decimal;
                hasTotalsMismatch: boolean;
                provider: {
                    id: string;
                    name: string;
                    type: ProviderType;
                    cif: string;
                };
                items: Array<InvoiceItemWithoutMaterial | InvoiceItemWithMaterial>;
            }>>
        ])

        const totalPages = Math.ceil(totalCount / pageSize)

        const transformedInvoices = invoices.map(invoice => {
            const base: {
                id: string;
                invoiceCode: string;
                totalAmount: number;
                hasTotalsMismatch: boolean;
                provider: {
                    id: string;
                    name: string;
                    type: ProviderType;
                    cif: string;
                };
                issueDate: Date;
                items?: Array<{
                    id: string;
                    quantity: number;
                    listPrice: number | null;
                    discountPercentage: number | null;
                    unitPrice: number;
                    totalPrice: number;
                    workOrder: string | null;
                    description: string | null;
                    lineNumber: number | null;
                    itemDate: Date;
                    material: {
                        id: string;
                        code: string;
                        name: string;
                        category: string | null;
                        unit: string | null;
                        productGroup: {
                            id: string;
                            standardizedName: string;
                        } | null;
                    };
                }>;
            } = {
                id: invoice.id,
                invoiceCode: invoice.invoiceCode,
                totalAmount: invoice.totalAmount.toNumber(),
                hasTotalsMismatch: invoice.hasTotalsMismatch,
                provider: {
                    id: invoice.provider.id,
                    name: invoice.provider.name,
                    type: invoice.provider.type,
                    cif: invoice.provider.cif
                },
                issueDate: invoice.issueDate
            }

            if (params.includeItems && invoice.items && invoice.items.length > 0) {
                base.items = invoice.items
                    .filter((item): item is InvoiceItemWithMaterial => hasMaterial(item))
                    .map((itemWithMaterial) => {
                        return {
                            id: itemWithMaterial.id,
                            quantity: itemWithMaterial.quantity.toNumber(),
                            listPrice: itemWithMaterial.listPrice?.toNumber() ?? null,
                            discountPercentage: itemWithMaterial.discountPercentage?.toNumber() ?? null,
                            unitPrice: itemWithMaterial.unitPrice.toNumber(),
                            totalPrice: itemWithMaterial.totalPrice.toNumber(),
                            workOrder: itemWithMaterial.workOrder,
                            description: itemWithMaterial.description,
                            lineNumber: itemWithMaterial.lineNumber,
                            itemDate: itemWithMaterial.itemDate,
                            material: {
                                id: itemWithMaterial.material.id,
                                code: itemWithMaterial.material.code,
                                name: itemWithMaterial.material.name,
                                category: itemWithMaterial.material.category,
                                unit: itemWithMaterial.material.unit,
                                productGroup: itemWithMaterial.material.productGroup ? {
                                    id: itemWithMaterial.material.productGroup.id,
                                    standardizedName: itemWithMaterial.material.productGroup.standardizedName
                                } : null
                            }
                        };
                    });
            }

            return base
        })

        return {
            invoices: transformedInvoices,
            totalCount,
            totalPages,
            currentPage: page,
            pageSize
        }
    } catch (error) {
        console.error('Error fetching invoices:', error)
        if (error instanceof Error) {
            throw new Error(`Failed to fetch invoices: ${error.message}`);
        }
        throw new Error('Failed to fetch invoices due to an unknown error');
    }
}

export async function deleteInvoiceAction(invoiceId: string) {
    const user = await requireAuth()

    if (!invoiceId) {
        return { success: false, message: "ID de factura no proporcionado." };
    }

    try {
        // First verify the invoice belongs to the user
        const invoice = await prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                provider: { userId: user.id }
            }
        });

        if (!invoice) {
            return { success: false, message: "Factura no encontrada o no tienes permisos para eliminarla." };
        }

        // Prisma automatically handles cascading deletes for related InvoiceItems
        // if the relation is defined with `onDelete: Cascade` in the schema.
        // If not, InvoiceItems need to be deleted manually first:
        // await prisma.invoiceItem.deleteMany({ where: { invoiceId } });

        await prisma.invoice.delete({
            where: { id: invoiceId },
        });

        revalidatePath("/facturas");
        return { success: true, message: "Factura eliminada correctamente." };
    } catch (error) {
        console.error("Error deleting invoice:", error);
        // Check if it's a Prisma error for record not found (e.g., already deleted)
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') {
                revalidatePath("/facturas"); // Still revalidate, as it might have been deleted by another request
                return { success: false, message: "La factura no existe o ya ha sido eliminada." };
            }
        }
        return { success: false, message: "Error al eliminar la factura." };
    }
}

export async function getInvoiceDetails(id: string) {
    const user = await requireAuth()

    try {
        const invoice = await prisma.invoice.findFirst({
            where: {
                id,
                provider: { userId: user.id }
            },
            include: {
                provider: true,
                items: {
                    include: {
                        material: true
                    },
                    orderBy: [
                        { lineNumber: 'asc' },
                        { createdAt: 'asc' }
                    ]
                }
            }
        });

        if (!invoice) {
            throw new Error('Invoice not found or you do not have permission to view it');
        }

        return {
            id: invoice.id,
            issueDate: invoice.issueDate,
            status: invoice.status,
            totalAmount: invoice.totalAmount.toNumber(),
            ivaPercentage: invoice.ivaPercentage?.toNumber() ?? 21.00,
            retentionAmount: invoice.retentionAmount?.toNumber() ?? 0.00,
            originalFileName: invoice.originalFileName,
            pdfUrl: invoice.pdfUrl,
            hasTotalsMismatch: invoice.hasTotalsMismatch,
            provider: {
                id: invoice.provider.id,
                name: invoice.provider.name,
                cif: invoice.provider.cif,
                email: invoice.provider.email,
                phone: invoice.provider.phone,
                address: invoice.provider.address
            },
            items: invoice.items.map(item => ({
                id: item.id,
                materialId: item.materialId,
                quantity: item.quantity.toNumber(),
                listPrice: item.listPrice?.toNumber() ?? null,
                discountPercentage: item.discountPercentage?.toNumber() ?? null,
                discountRaw: item.discountRaw,
                unitPrice: item.unitPrice.toNumber(),
                totalPrice: item.totalPrice.toNumber(),
                workOrder: item.workOrder,
                material: {
                    id: item.material.id,
                    name: item.material.name,
                    code: item.material.code,
                    description: item.material.description
                }
            }))
        };
    } catch (error) {
        console.error('Error fetching invoice details:', error);
        throw new Error('Failed to fetch invoice details');
    }
}



