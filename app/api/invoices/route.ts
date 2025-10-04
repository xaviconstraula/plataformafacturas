import { NextRequest, NextResponse } from 'next/server'
import { withAuthHandler } from '@/lib/api-middleware'
import { getInvoices } from '@/lib/actions/facturas'

export const GET = withAuthHandler(async (request: NextRequest) => {
    try {
        const { searchParams } = new URL(request.url)

        const params = {
            search: searchParams.get('search') || undefined,
            workOrder: searchParams.get('workOrder') || undefined,
            month: searchParams.get('month') || undefined,
            quarter: searchParams.get('quarter') || undefined,
            year: searchParams.get('year') || undefined,
            fiscalYear: searchParams.get('fiscalYear') || undefined,
            supplier: searchParams.get('supplier') || undefined,
            material: searchParams.get('material') || undefined,
            category: searchParams.get('category') || undefined,
            minAmount: searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined,
            maxAmount: searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined,
            minUnitPrice: searchParams.get('minUnitPrice') ? parseFloat(searchParams.get('minUnitPrice')!) : undefined,
            maxUnitPrice: searchParams.get('maxUnitPrice') ? parseFloat(searchParams.get('maxUnitPrice')!) : undefined,
            page: parseInt(searchParams.get('page') || '1', 10),
            pageSize: searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : undefined,
        }

        const data = await getInvoices(params)

        const res = NextResponse.json(data)
        res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=60')
        return res
    } catch (error) {
        console.error('Error fetching invoices:', error)
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }
})


