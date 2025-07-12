import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
    try {
        const categories = await prisma.material.findMany({
            select: {
                category: true,
            },
            where: {
                category: {
                    not: null
                }
            },
            distinct: ['category'],
            orderBy: {
                category: 'asc'
            }
        })

        const uniqueCategories = categories
            .map(item => item.category)
            .filter(Boolean)
            .sort()

        return NextResponse.json(uniqueCategories)
    } catch (error) {
        console.error('Error fetching categories:', error)
        return NextResponse.json(
            { error: 'Failed to fetch categories' },
            { status: 500 }
        )
    }
} 