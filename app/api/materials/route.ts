import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuthHandler } from '@/lib/api-middleware'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
    try {
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1', 10)
        const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '200', 10), 1000) // Max 1000 per page
        const skip = (page - 1) * pageSize

        const [materials, totalCount] = await Promise.all([
            prisma.material.findMany({
                select: {
                    id: true,
                    code: true,
                    name: true,
                    description: true,
                    category: true,
                    unit: true,
                    isActive: true,
                    referenceCode: true,
                    alternativeCodes: true,
                    createdAt: true,
                    updatedAt: true,
                    productGroup: {
                        select: {
                            id: true,
                            standardizedName: true,
                            category: true,
                            unit: true,
                        }
                    }
                },
                where: {
                    isActive: true,
                    userId: user.id
                },
                orderBy: {
                    name: 'asc'
                },
                skip,
                take: pageSize
            }),
            prisma.material.count({
                where: {
                    isActive: true,
                    userId: user.id
                }
            })
        ])

        const res = NextResponse.json({
            materials,
            totalCount,
            page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize)
        })
        res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60') // 5 min cache
        return res
    } catch (error) {
        console.error('Error fetching materials:', error)
        return NextResponse.json(
            { error: 'Failed to fetch materials' },
            { status: 500 }
        )
    }
}) 