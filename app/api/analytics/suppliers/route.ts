import { NextRequest, NextResponse } from 'next/server'
import { withAuthHandler } from '@/lib/api-middleware'
import { getSupplierAnalyticsPaginated } from '@/lib/actions/analytics'
import { ProviderType } from '@/generated/prisma'

export const GET = withAuthHandler(async (request: NextRequest, user) => {
    try {
        const { searchParams } = new URL(request.url)

        // Parse query parameters
        const supplierTypeParam = searchParams.get('supplierType')
        const params = {
            supplierId: searchParams.get('supplierId') || undefined,
            supplierType: supplierTypeParam ? (supplierTypeParam as ProviderType) : undefined,
            supplierCif: searchParams.get('supplierCif') || undefined,
            workOrder: searchParams.get('workOrder') || undefined,
            materialCategory: searchParams.get('materialCategory') || undefined,
            sortBy: (searchParams.get('sortBy') as 'spent' | 'invoices' | 'materials' | 'name') || 'spent',
            sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
            page: parseInt(searchParams.get('page') || '1', 10),
            pageSize: parseInt(searchParams.get('pageSize') || '50', 10),
            startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
            endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
        }

        const result = await getSupplierAnalyticsPaginated(params)

        const res = NextResponse.json(result)
        res.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
        return res
    } catch (error) {
        console.error('Error fetching supplier analytics:', error)
        return NextResponse.json(
            { error: 'Failed to fetch supplier analytics' },
            { status: 500 }
        )
    }
})
