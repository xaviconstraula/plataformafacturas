

import { checkAndUpdateBatchStatuses } from '../lib/actions/invoices'

async function main() {
    try {
        console.log('[Batch Status Checker] Starting batch status check...')

        const result = await checkAndUpdateBatchStatuses()

        console.log(`[Batch Status Checker] ✅ Completed successfully:`)
        console.log(`  - Processed batches: ${result.processedBatches}`)
        console.log(`  - Newly completed: ${result.completedBatches}`)

        // Exit with success code
        process.exit(0)
    } catch (error) {
        console.error('[Batch Status Checker] ❌ Error:', error)
        process.exit(1)
    }
}

// Run the script
main()
