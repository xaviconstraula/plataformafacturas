"use server"

import { prisma } from "@/lib/db"
import { type PriceAlert } from "@/lib/types/prisma"
import { requireAuth } from "@/lib/auth-utils"

export async function getPriceAlerts(): Promise<PriceAlert[]> {
    const user = await requireAuth()

    const alerts = await prisma.priceAlert.findMany({
        where: {
            provider: { userId: user.id }
        },
        select: {
            id: true,
            material: {
                select: {
                    id: true,
                    name: true,
                },
            },
            provider: {
                select: {
                    id: true,
                    name: true,
                },
            },
            invoice: {
                select: {
                    id: true,
                    issueDate: true,
                },
            },
            oldPrice: true,
            newPrice: true,
            percentage: true,
            status: true,
            createdAt: true,
            effectiveDate: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    })

    return alerts.map(alert => ({
        id: alert.id,
        material: alert.material,
        provider: alert.provider,
        previousPrice: Number(alert.oldPrice),
        currentPrice: Number(alert.newPrice),
        percentageChange: Number(alert.percentage),
        status: alert.status as PriceAlert['status'],
        createdAt: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : new Date(alert.createdAt).toISOString(),
        effectiveDate: alert.effectiveDate instanceof Date ? alert.effectiveDate.toISOString() : new Date(alert.effectiveDate).toISOString(),
        issueDate: alert.invoice.issueDate instanceof Date ? alert.invoice.issueDate.toISOString() : new Date(alert.invoice.issueDate).toISOString(),
    }))
}

export async function updateAlertStatus(alertId: string, status: "APPROVED" | "REJECTED") {
    const user = await requireAuth()

    // First verify the alert belongs to the user
    const existingAlert = await prisma.priceAlert.findFirst({
        where: {
            id: alertId,
            provider: { userId: user.id }
        }
    })

    if (!existingAlert) {
        throw new Error('Alert not found or you do not have permission to update it')
    }

    const alert = await prisma.priceAlert.update({
        where: { id: alertId },
        data: { status },
        include: {
            material: {
                select: {
                    id: true,
                    name: true
                }
            },
            provider: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    })

    return {
        id: alert.id,
        material: {
            id: alert.material.id,
            name: alert.material.name
        },
        provider: {
            id: alert.provider.id,
            name: alert.provider.name
        },
        previousPrice: alert.oldPrice.toNumber(),
        currentPrice: alert.newPrice.toNumber(),
        percentageChange: alert.percentage.toNumber(),
        createdAt: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : new Date(alert.createdAt).toISOString(),
        effectiveDate: alert.effectiveDate instanceof Date ? alert.effectiveDate.toISOString() : new Date(alert.effectiveDate).toISOString(),
        status: alert.status
    }
} 