import { PrismaClient, BatchStatus, Prisma } from '../generated/prisma'

const prisma = new PrismaClient()

async function resetBatchProcessing() {
    console.log('🔄 Starting batch processing reset...')

    try {
        // Get current counts before reset
        const batchCount = await prisma.batchProcessing.count()
        const processingBatches = await prisma.batchProcessing.count({
            where: { status: BatchStatus.PROCESSING }
        })
        const completedBatches = await prisma.batchProcessing.count({
            where: { status: BatchStatus.COMPLETED }
        })

        console.log('📊 Current batch processing status:')
        console.log(`  - Total batches: ${batchCount}`)
        console.log(`  - Processing batches: ${processingBatches}`)
        console.log(`  - Completed batches: ${completedBatches}`)

        if (batchCount === 0) {
            console.log('ℹ️ No batch processing records found in the database. Nothing to reset.')
            return true
        }

        console.log('\n🔄 Resetting all batch processing records...')

        // Reset all batch processing records to PENDING status with zero counts
        const result = await prisma.batchProcessing.updateMany({
            data: {
                status: BatchStatus.PENDING,
                processedFiles: 0,
                successfulFiles: 0,
                failedFiles: 0,
                blockedFiles: 0,
                completedAt: null,
                startedAt: null,
                estimatedCompletion: null,
                currentFile: null,
                errors: Prisma.JsonNull
            }
        })

        console.log(`✅ Reset ${result.count} batch processing records`)

        // Verification
        const resetCount = await prisma.batchProcessing.count({
            where: {
                status: BatchStatus.PENDING,
                processedFiles: 0,
                successfulFiles: 0,
                failedFiles: 0,
                blockedFiles: 0,
                completedAt: null
            }
        })

        console.log('\n✅ Verification results:')
        console.log(`  - Successfully reset batches: ${resetCount}`)

        if (resetCount !== batchCount) {
            console.log('⚠️ Warning: Not all batches were reset. Some may have different constraints.')
            return false
        }

        console.log('✅ Verification: All batch processing records successfully reset')
        return true

    } catch (error) {
        console.error('❌ Error during batch processing reset:', error)
        return false
    }
}

async function main() {
    console.log('🚨 WARNING: This will reset ALL batch processing records to PENDING status!')
    console.log('This will:')
    console.log('  - Set all batch statuses to PENDING')
    console.log('  - Reset processedFiles, successfulFiles, failedFiles, blockedFiles to 0')
    console.log('  - Clear completedAt, startedAt, estimatedCompletion timestamps')
    console.log('  - Clear currentFile and errors fields')
    console.log('')
    console.log('This action CANNOT be undone!')
    console.log('')

    // Simple confirmation - in production you might want to add a proper prompt
    const args = process.argv.slice(2)
    const confirmed = args.includes('--confirm')

    if (!confirmed) {
        console.log('To proceed, run this script with the --confirm flag:')
        console.log('npx tsx scripts/reset-batch-processing.ts --confirm')
        process.exit(1)
    }

    const success = await resetBatchProcessing()

    if (success) {
        console.log('✅ Batch processing reset completed successfully')
        process.exit(0)
    } else {
        console.log('❌ Batch processing reset failed or completed with warnings')
        process.exit(1)
    }
}

main()
    .catch((e) => {
        console.error('❌ Fatal error during batch processing reset:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
