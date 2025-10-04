import { NextRequest, NextResponse } from 'next/server'
import { withAuthHandler } from '@/lib/api-middleware'
import { getMaterialAnalyticsPaginated } from '@/lib/actions/analytics'
import { ProviderType } from '@/generated/prisma'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
    try {
        const { searchParams } = new URL(request.url)

        // Parse query parameters
        const params = {
            category: searchParams.get('category') || undefined,
            workOrder: searchParams.get('workOrder') || undefined,
            supplierId: searchParams.get('supplierId') || undefined,
            materialSearch: searchParams.get('materialSearch') || undefined,
            sortBy: (searchParams.get('sortBy') as 'quantity' | 'cost' | 'lastPurchase' | 'name') || 'cost',
            sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
            page: parseInt(searchParams.get('page') || '1', 10),
            pageSize: parseInt(searchParams.get('pageSize') || '50', 10),
            startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
            endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
        }

        const result = await getMaterialAnalyticsPaginated(params)

        const res = NextResponse.json(result)
        res.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
        return res
    } catch (error) {
        console.error('Error fetching material analytics:', error)
        return NextResponse.json(
            { error: 'Failed to fetch material analytics' },
            { status: 500 }
        )
    }
})
