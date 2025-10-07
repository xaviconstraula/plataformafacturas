"use server"

import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth-utils"

export async function getDashboardStats() {
    // Removed noStore() - dashboard stats can be cached for better performance
    const user = await requireAuth()

    try {
        const [totalInvoices, totalProviders, totalMaterials, pendingAlerts] = await Promise.all([
            prisma.invoice.count({
                where: {
                    provider: {
                        userId: user.id
                    }
                }
            }),
            prisma.provider.count({
                where: {
                    userId: user.id
                }
            }),
            prisma.material.count({
                where: {
                    userId: user.id,
                    isActive: true
                }
            }),
            prisma.priceAlert.count({
                where: {
                    status: 'PENDING',
                    provider: {
                        userId: user.id
                    }
                }
            })
        ])

        return {
            totalInvoices,
            totalProviders,
            totalMaterials,
            pendingAlerts
        }
    } catch (error) {
        console.error('Database Error:', error)
        throw new Error('Failed to fetch dashboard stats.')
    }
}

export async function getOverviewData() {
    // Removed noStore() - overview data can be cached for better performance
    const user = await requireAuth()

    try {
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

        const invoices = await prisma.invoice.findMany({
            where: {
                issueDate: {
                    gte: sixMonthsAgo
                },
                provider: {
                    userId: user.id
                }
            },
            select: {
                issueDate: true,
                totalAmount: true
            },
            orderBy: {
                issueDate: 'asc'
            }
        })

        // Group by month and calculate total
        const monthlyData = invoices.reduce((acc, invoice) => {
            const month = invoice.issueDate.toLocaleString('default', { month: 'long' })
            if (!acc[month]) {
                acc[month] = 0
            }
            // Sum total amount per month
            acc[month] += invoice.totalAmount.toNumber()
            return acc
        }, {} as Record<string, number>)

        // Convert to array format expected by the chart
        return Object.entries(monthlyData).map(([name, total]) => ({
            name,
            total // Remove division by 1000
        }))
    } catch (error) {
        console.error('Database Error:', error)
        throw new Error('Failed to fetch overview data.')
    }
}

interface MaterialBySupplierType {
    name: string;
    value: number;
    supplier: "Materiales" | "Maquinaria";
}

export async function getMaterialsBySupplierType(): Promise<MaterialBySupplierType[]> {
    const user = await requireAuth()

    // Removed noStore() - materials by supplier type can be cached for better performance
    try {
        // Bound time window to reduce data size
        const twelveMonthsAgo = new Date()
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

        // Aggregate directly from invoice items to avoid deep nested loads
        const items = await prisma.invoiceItem.findMany({
            where: {
                material: { userId: user.id },
                invoice: {
                    provider: { userId: user.id },
                    issueDate: { gte: twelveMonthsAgo }
                }
            },
            select: {
                totalPrice: true,
                material: { select: { id: true, name: true } },
                invoice: { select: { provider: { select: { type: true } } } }
            }
        })

        // Aggregate per material and provider type by value
        const materialAgg = new Map<string, { name: string; byType: Record<'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL', number> }>()

        for (const it of items) {
            const materialId = it.material.id
            const materialName = it.material.name
            const providerType = it.invoice.provider.type as 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL'
            const value = it.totalPrice.toNumber()

            if (!materialAgg.has(materialId)) {
                materialAgg.set(materialId, { name: materialName, byType: { MATERIAL_SUPPLIER: 0, MACHINERY_RENTAL: 0 } })
            }
            const entry = materialAgg.get(materialId)!
            entry.byType[providerType] += value
        }

        const result = Array.from(materialAgg.values())
            .map(entry => {
                const ms = entry.byType.MATERIAL_SUPPLIER
                const mr = entry.byType.MACHINERY_RENTAL
                const dominantType = (ms >= mr ? 'MATERIAL_SUPPLIER' : 'MACHINERY_RENTAL') as 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL'
                const totalValue = ms + mr
                return {
                    name: entry.name,
                    value: totalValue,
                    supplier: (dominantType === 'MATERIAL_SUPPLIER' ? 'Materiales' : 'Maquinaria') as "Materiales" | "Maquinaria"
                }
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)

        return result
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch materials by supplier type.');
    }
}

export async function getPendingPriceAlerts() {
    const user = await requireAuth()

    const alerts = await prisma.priceAlert.findMany({
        where: {
            status: "PENDING",
            provider: { userId: user.id }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 3,
        include: {
            material: {
                select: {
                    name: true
                }
            },
            provider: {
                select: {
                    name: true
                }
            }
        }
    })

    return alerts.map(alert => ({
        id: alert.id,
        oldPrice: alert.oldPrice.toNumber(),
        newPrice: alert.newPrice.toNumber(),
        percentage: alert.percentage.toNumber(),
        createdAt: alert.createdAt.toISOString(),
        materialId: alert.materialId,
        providerId: alert.providerId,
        materialName: alert.material.name,
        providerName: alert.provider.name
    }))
} 