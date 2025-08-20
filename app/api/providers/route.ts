import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuthHandler } from '@/lib/api-middleware'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
    try {
        const providers = await prisma.provider.findMany({
            select: {
                id: true,
                name: true,
                cif: true,
                type: true,
                email: true,
                phone: true,
                address: true,
                createdAt: true,
                updatedAt: true,
            },
            where: {
                userId: user.id
            },
            orderBy: {
                name: 'asc'
            }
        })

        return NextResponse.json(providers)
    } catch (error) {
        console.error('Error fetching providers:', error)
        return NextResponse.json(
            { error: 'Failed to fetch providers' },
            { status: 500 }
        )
    }
}) 