import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
    try {
        const materials = await prisma.material.findMany({
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
                isActive: true
            },
            orderBy: {
                name: 'asc'
            }
        })

        return NextResponse.json(materials)
    } catch (error) {
        console.error('Error fetching materials:', error)
        return NextResponse.json(
            { error: 'Failed to fetch materials' },
            { status: 500 }
        )
    }
} 