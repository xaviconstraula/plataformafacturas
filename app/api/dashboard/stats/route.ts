import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
    try {
        const [totalInvoices, totalProviders, totalMaterials, pendingAlerts] = await Promise.all([
            prisma.invoice.count(),
            prisma.provider.count(),
            prisma.material.count({
                where: {
                    isActive: true
                }
            }),
            prisma.priceAlert.count({
                where: {
                    status: 'PENDING'
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
} 