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
    const materialProviders = await prisma.materialProvider.findMany({
        select: {
            material: {
                select: {
                    name: true
                }
            },
            provider: {
                select: {
                    type: true
                }
            }
        },
        orderBy: {
            materialId: 'desc'
        }
    })

    // Group and count materials by provider type
    const groupedData = materialProviders.reduce((acc: Record<string, Record<string, number>>, curr) => {
        const materialName = curr.material.name
        const providerType = curr.provider.type

        if (!acc[materialName]) {
            acc[materialName] = {}
        }
        if (!acc[materialName][providerType]) {
            acc[materialName][providerType] = 0
        }
        acc[materialName][providerType]++

        return acc
    }, {})

    // Convert to the format expected by the chart
    const result = Object.entries(groupedData)
        .map(([name, providers]) => ({
            name,
            value: Object.values(providers).reduce((sum, count) => sum + count, 0),
            supplier: Object.entries(providers)
                .sort(([, a], [, b]) => b - a)[0][0] // Get the provider type with highest count
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