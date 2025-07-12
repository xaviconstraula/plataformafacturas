import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
    try {
        const workOrders = await prisma.invoiceItem.findMany({
            select: {
                workOrder: true,
            },
            where: {
                workOrder: {
                    not: null
                }
            },
            distinct: ['workOrder'],
            orderBy: {
                workOrder: 'asc'
            }
        })

        const uniqueWorkOrders = workOrders
            .map(item => item.workOrder)
            .filter(Boolean)
            .sort()

        return NextResponse.json(uniqueWorkOrders)
    } catch (error) {
        console.error('Error fetching work orders:', error)
        return NextResponse.json(
            { error: 'Failed to fetch work orders' },
            { status: 500 }
        )
    }
} 