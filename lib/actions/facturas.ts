"use server"

import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma"
import { revalidatePath } from "next/cache"

// Helper function to process workOrder search terms
function processWorkOrderSearch(workOrder: string): string {
    return workOrder.replace(/\s+/g, '-');
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
}

const DEFAULT_PAGE_SIZE = 15

export async function getInvoices(params: GetInvoicesParams) {
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
            ...(cleanSupplier ? { providerId: cleanSupplier } : {}),
            ...(params.search ? {
                OR: [
                    { invoiceCode: { contains: params.search, mode: Prisma.QueryMode.insensitive } },
                    { provider: { name: { contains: params.search, mode: Prisma.QueryMode.insensitive } } },
                    { items: { some: { material: { name: { contains: params.search, mode: Prisma.QueryMode.insensitive } } } } }
                ]
            } : {}),
            ...(params.workOrder ? {
                items: { some: { workOrder: { contains: processWorkOrderSearch(params.workOrder), mode: Prisma.QueryMode.insensitive } } }
            } : {}),
            ...(cleanMaterial ? {
                items: { some: { materialId: cleanMaterial } }
            } : {}),
            ...(cleanCategory ? {
                items: { some: { material: { category: { contains: cleanCategory, mode: Prisma.QueryMode.insensitive } } } }
            } : {}),
            ...((params.minUnitPrice !== undefined || params.maxUnitPrice !== undefined) ? {
                items: {
                    some: {
                        unitPrice: {
                            ...(params.minUnitPrice !== undefined ? { gte: params.minUnitPrice } : {}),
                            ...(params.maxUnitPrice !== undefined ? { lte: params.maxUnitPrice } : {})
                        }
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
                include: {
                    provider: true,
                    items: {
                        include: {
                            material: {
                                include: {
                                    productGroup: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            })
        ])

        const totalPages = Math.ceil(totalCount / pageSize)

        const transformedInvoices = invoices.map(invoice => ({
            id: invoice.id,
            invoiceCode: invoice.invoiceCode,
            totalAmount: invoice.totalAmount.toNumber(),
            provider: {
                id: invoice.provider.id,
                name: invoice.provider.name,
                type: invoice.provider.type,
                cif: invoice.provider.cif
            },
            items: invoice.items.map(item => ({
                id: item.id,
                quantity: item.quantity.toNumber(),
                unitPrice: item.unitPrice.toNumber(),
                totalPrice: item.totalPrice.toNumber(),
                workOrder: item.workOrder,
                description: item.description,
                lineNumber: item.lineNumber,
                itemDate: item.itemDate,
                material: {
                    id: item.material.id,
                    code: item.material.code,
                    name: item.material.name,
                    category: item.material.category,
                    unit: item.material.unit,
                    productGroup: item.material.productGroup ? {
                        id: item.material.productGroup.id,
                        standardizedName: item.material.productGroup.standardizedName
                    } : null
                }
            })),
            issueDate: invoice.issueDate
        }))

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
    if (!invoiceId) {
        return { success: false, message: "ID de factura no proporcionado." };
    }

    try {
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
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id },
            include: {
                provider: true,
                items: {
                    include: {
                        material: true
                    }
                }
            }
        });

        if (!invoice) {
            throw new Error('Invoice not found');
        }

        return {
            id: invoice.id,
            issueDate: invoice.issueDate,
            status: invoice.status,
            totalAmount: invoice.totalAmount.toNumber(),
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
                quantity: item.quantity.toNumber(),
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



