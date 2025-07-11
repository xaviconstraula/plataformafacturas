"use server"

import { prisma } from "@/lib/db"

export async function getDashboardStats() {
    // Removed noStore() - dashboard stats can be cached for better performance
    try {
        const [totalInvoices, totalProviders, totalMaterials, pendingAlerts] = await Promise.all([
            prisma.invoice.count(),
            prisma.provider.count(),
            prisma.material.count(),
            prisma.priceAlert.count({
                where: {
                    status: 'PENDING'
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
    try {
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

        const invoices = await prisma.invoice.findMany({
            where: {
                createdAt: {
                    gte: sixMonthsAgo
                }
            },
            select: {
                createdAt: true,
                totalAmount: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        })

        // Group by month and calculate total
        const monthlyData = invoices.reduce((acc, invoice) => {
            const month = invoice.createdAt.toLocaleString('default', { month: 'long' })
            if (!acc[month]) {
                acc[month] = 0
            }
            acc[month] += 1 // Increment count for each invoice
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
    // Removed noStore() - materials by supplier type can be cached for better performance
    try {
        // Get all materials with their invoice items and provider information
        const materials = await prisma.material.findMany({
            include: {
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
            totalValue: number
            providerType: 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL'
        }> = {};

        // Process each material
        for (const material of materials) {
            if (material.invoiceItems.length === 0) continue;

            // Get the most common provider type for this material
            const providerTypes = material.invoiceItems.map(item => item.invoice.provider.type);
            const typeCount = providerTypes.reduce((acc, type) => {
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const dominantType = Object.entries(typeCount)
                .sort(([, a], [, b]) => b - a)[0]?.[0] as 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL';

            if (dominantType) {
                // Calculate total value from invoice items
                const totalValue = material.invoiceItems.reduce((sum, item) =>
                    sum + item.totalPrice.toNumber(), 0);

                materialsByType[material.name] = {
                    totalValue: totalValue, // Store the raw total value
                    providerType: dominantType
                };
            }
        }

        // Convert to the format expected by the chart
        const result = Object.entries(materialsByType)
            .map(([name, data]) => ({
                name,
                value: data.totalValue,
                supplier: (data.providerType === 'MATERIAL_SUPPLIER' ? 'Materiales' : 'Maquinaria') as "Materiales" | "Maquinaria"
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10); // Get top 10 materials by value

        return result;
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch materials by supplier type.');
    }
}

export async function getPendingPriceAlerts() {
    const alerts = await prisma.priceAlert.findMany({
        where: {
            status: "PENDING"
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