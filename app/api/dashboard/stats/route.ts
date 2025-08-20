import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuthHandler } from '@/lib/api-middleware'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
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
                    isActive: true,
                    userId: user.id
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

        return NextResponse.json({
            totalInvoices,
            totalProviders,
            totalMaterials,
            pendingAlerts
        })
    } catch (error) {
        console.error('Error fetching dashboard stats:', error)
        return NextResponse.json(
            { error: 'Failed to fetch dashboard stats' },
            { status: 500 }
        )
    }
}) 