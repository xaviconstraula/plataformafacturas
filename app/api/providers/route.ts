import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuthHandler } from '@/lib/api-middleware'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
    try {
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1', 10)
        const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '100', 10), 500) // Max 500 per page
        const skip = (page - 1) * pageSize

        const [providers, totalCount] = await Promise.all([
            prisma.provider.findMany({
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
                },
                skip,
                take: pageSize
            }),
            prisma.provider.count({
                where: { userId: user.id }
            })
        ])

        const res = NextResponse.json({
            providers,
            totalCount,
            page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize)
        })
        res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60') // 5 min cache
        return res
    } catch (error) {
        console.error('Error fetching providers:', error)
        return NextResponse.json(
            { error: 'Failed to fetch providers' },
            { status: 500 }
        )
    }
}) 