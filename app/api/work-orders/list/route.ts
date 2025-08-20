import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuthHandler } from '@/lib/api-middleware'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
    try {
        const workOrders = await prisma.invoiceItem.findMany({
            select: {
                workOrder: true,
            },
            where: {
                workOrder: {
                    not: null
                },
                invoice: {
                    provider: {
                        userId: user.id
                    }
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
}) 