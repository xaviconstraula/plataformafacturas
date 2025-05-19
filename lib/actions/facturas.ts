"use server"

import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma"

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
                quantity: item.quantity.toNumber(),
                totalPrice: item.totalPrice.toNumber(),
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



