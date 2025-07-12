import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
    try {
        const alerts = await prisma.priceAlert.findMany({
            where: {
                status: 'PENDING'
            },
            include: {
                material: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    }
                },
                provider: {
                    select: {
                        id: true,
                        name: true,
                        cif: true,
                    }
                },
                invoice: {
                    select: {
                        id: true,
                        issueDate: true,
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        const formattedAlerts = alerts.map(alert => ({
            id: alert.id,
            oldPrice: Number(alert.oldPrice),
            newPrice: Number(alert.newPrice),
            percentage: Number(alert.percentage),
            createdAt: alert.createdAt.toISOString(),
            materialId: alert.material.id,
            providerId: alert.provider.id,
            materialName: alert.material.name,
            providerName: alert.provider.name,
            issueDate: alert.invoice.issueDate.toISOString(),
        }))

        return NextResponse.json(formattedAlerts)
    } catch (error) {
        console.error('Error fetching alerts:', error)
        return NextResponse.json(
            { error: 'Failed to fetch alerts' },
            { status: 500 }
        )
    }
} 