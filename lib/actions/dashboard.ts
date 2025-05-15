"use server"

import { prisma } from "@/lib/db"

export async function getDashboardStats() {
    const [
        totalInvoices,
        totalProviders,
        totalMaterials,
        pendingAlerts,
        recentInvoices
    ] = await Promise.all([
        prisma.invoice.count(),
        prisma.provider.count(),
        prisma.material.count(),
        prisma.priceAlert.count({
            where: {
                status: "PENDING"
            }
        }),
        prisma.invoice.findMany({
            take: 5,
            orderBy: {
                issueDate: 'desc'
            },
            include: {
                provider: true,
                items: {
                    include: {
                        material: true
                    }
                }
            }
        })
    ])

    return {
        totalInvoices,
        totalProviders,
        totalMaterials,
        pendingAlerts,
        recentInvoices: recentInvoices.map(invoice => ({
            id: invoice.id,
            supplier: invoice.provider.name,
            material: invoice.items[0]?.material.name ?? 'N/A',
            amount: invoice.totalAmount.toNumber(),
            date: invoice.issueDate.toISOString()
        }))
    }
}

export async function getOverviewData() {
    const TODAY = new Date('2025-05-12')
    const sixMonthsAgo = new Date(TODAY)
    sixMonthsAgo.setMonth(TODAY.getMonth() - 5) // Get last 6 months including current
    sixMonthsAgo.setDate(1) // Start from beginning of month
    sixMonthsAgo.setHours(0, 0, 0, 0)

    const invoices = await prisma.invoice.groupBy({
        by: ['createdAt'],
        where: {
            createdAt: {
                gte: sixMonthsAgo
            }
        },
        _count: {
            id: true
        }
    })

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    // Initialize last 6 months with 0 values
    const monthlyData: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
        const date = new Date(TODAY)
        date.setMonth(TODAY.getMonth() - i)
        const monthName = monthNames[date.getMonth()]
        monthlyData[monthName] = 0
    }

    // Fill in actual values
    for (const invoice of invoices) {
        const month = invoice.createdAt.getMonth()
        const monthName = monthNames[month]
        if (monthlyData.hasOwnProperty(monthName)) {
            monthlyData[monthName] += invoice._count.id
        }
    }

    // Convert to array format expected by the chart
    // Preserve the order of months
    return Object.entries(monthlyData).map(([name, total]) => ({
        name,
        total
    }))
}

export async function getMaterialsBySupplierType() {
    const materials = await prisma.material.findMany({
        include: {
            providers: {
                include: {
                    provider: true
                }
            },
            invoiceItems: {
                include: {
                    invoice: {
                        include: {
                            provider: true
                        }
                    }
                }
            }
        }
    });

    const materialsByType: Record<string, {
        materialCount: number,
        totalValue: number
        providerType: 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL'
    }> = {};

    // Process each material
    for (const material of materials) {
        // Get the most common provider type for this material
        const providerTypes = material.invoiceItems.map(item => item.invoice.provider.type);
        const typeCount = providerTypes.reduce((acc, type) => {
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const dominantType = Object.entries(typeCount)
            .sort(([, a], [, b]) => b - a)[0]?.[0] as 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL';

        if (dominantType) {
            materialsByType[material.name] = {
                materialCount: material.invoiceItems.length,
                totalValue: material.invoiceItems.reduce((sum, item) => sum + Number(item.totalPrice), 0),
                providerType: dominantType
            };
        }
    }

    // Convert to the format expected by the chart
    const result = Object.entries(materialsByType)
        .map(([name, data]) => ({
            name,
            value: data.totalValue,
            supplier: data.providerType === 'MATERIAL_SUPPLIER' ? 'Materiales' : 'Maquinaria'
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)

    return result
}

export async function getPendingPriceAlerts() {
    const alerts = await prisma.priceAlert.findMany({
        where: {
            status: "PENDING"
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 5,
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