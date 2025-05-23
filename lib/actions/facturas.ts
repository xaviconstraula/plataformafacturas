"use server"

import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma"
import { revalidatePath } from "next/cache"

interface GetInvoicesParams {
    month?: string
    quarter?: string
    year?: string
    supplier?: string
    search?: string
    page?: number
    pageSize?: number
}

const DEFAULT_PAGE_SIZE = 8

export async function getInvoices(params: GetInvoicesParams) {
    try {
        const page = params.page || 1
        const pageSize = params.pageSize || DEFAULT_PAGE_SIZE
        const skip = (page - 1) * pageSize

        const yearFilter = params.year && params.year !== 'all' ? parseInt(params.year) : null;
        const monthFilter = params.month && params.month !== 'all' ? parseInt(params.month) : null;
        const quarterFilter = params.quarter && params.quarter !== 'all' ? parseInt(params.quarter) : null;

        const effectiveYear = yearFilter ?? (monthFilter || quarterFilter ? new Date().getFullYear() : null);

        let dateFilter: Prisma.InvoiceWhereInput = {};

        if (effectiveYear) {
            if (monthFilter) {
                const startDate = new Date(effectiveYear, monthFilter - 1, 1);
                const endDate = new Date(effectiveYear, monthFilter, 1);
                dateFilter = { issueDate: { gte: startDate, lt: endDate } };
            } else if (quarterFilter) {
                const startMonth = (quarterFilter - 1) * 3;
                const startDate = new Date(effectiveYear, startMonth, 1);
                const endDate = new Date(effectiveYear, startMonth + 3, 1);
                dateFilter = { issueDate: { gte: startDate, lt: endDate } };
            } else {
                const startDate = new Date(effectiveYear, 0, 1);
                const endDate = new Date(effectiveYear + 1, 0, 1);
                dateFilter = { issueDate: { gte: startDate, lt: endDate } };
            }
        }

        const where: Prisma.InvoiceWhereInput = {
            ...dateFilter,
            ...(params.supplier ? { providerId: params.supplier } : {}),
            ...(params.search ? {
                OR: [
                    { invoiceCode: { contains: params.search, mode: Prisma.QueryMode.insensitive } },
                    { provider: { name: { contains: params.search, mode: Prisma.QueryMode.insensitive } } },
                    { items: { some: { material: { name: { contains: params.search, mode: Prisma.QueryMode.insensitive } } } } }
                ]
            } : {})
        };

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
                            material: true
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
            provider: {
                name: invoice.provider.name
            },
            items: invoice.items.map(item => ({
                unitPrice: item.unitPrice.toNumber(),
                material: {
                    name: item.material.name
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



