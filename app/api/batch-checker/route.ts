import { NextRequest, NextResponse } from 'next/server'
import { checkAndUpdateBatchStatuses } from '@/lib/actions/invoices'

// This endpoint can be called by a cron job or scheduled task
// to check batch statuses in the background, independent of client connections
export const GET = async (request: NextRequest) => {
    try {
        const authHeader = request.headers.get('authorization')
        const apiSecret = process.env.API_SECRET_KEY

        // Require API secret for security when calling from external cron jobs
        if (apiSecret && authHeader !== `Bearer ${apiSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('[Batch Checker] Starting background batch status check...')

        const result = await checkAndUpdateBatchStatuses()

        console.log(`[Batch Checker] Completed. Processed ${result.processedBatches} batches, ${result.completedBatches} newly completed.`)

        return NextResponse.json({
            success: true,
            processedBatches: result.processedBatches,
            completedBatches: result.completedBatches,
            message: `Processed ${result.processedBatches} batches, ${result.completedBatches} newly completed`
        })
    } catch (error) {
        console.error('[Batch Checker] Error:', error)
        return NextResponse.json({
            error: 'Failed to check batch statuses',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
