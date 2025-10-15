#!/usr/bin/env tsx

/**
 * Batch Cron Checker
 * 
 * A lightweight script that reuses existing batch processing logic
 * to check and process batches without requiring user authentication.
 * Designed to run as a cron job on Ubuntu VPS.
 * 
 * Usage: tsx scripts/batch-cron-checker.ts
 */

import { PrismaClient } from '@prisma/client'
import { GoogleGenAI } from '@google/genai'

const prisma = new PrismaClient()
const gemini = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY!,
})

// Types (copied from invoices.ts to avoid circular imports)
type BatchStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

interface GeminiBatchStatus {
    state?: string
    request_counts?: { completed?: number; failed?: number; total?: number }
    requestCounts?: { completed?: number; failed?: number; total?: number }
    dest?: unknown
}

interface GeminiInlineResponse { key?: string; response?: { text?: string }; error?: unknown }
type GeminiDest = { file_name?: string; fileName?: string; inlined_responses?: Array<GeminiInlineResponse>; inlinedResponses?: Array<GeminiInlineResponse> } | undefined | null;

// Helper functions (copied from invoices.ts)
function isRateLimitError(error: unknown): boolean {
    return error instanceof Error &&
        (error.message.includes('rate limit') ||
            error.message.includes('quota') ||
            error.message.includes('429'))
}

async function updateBatchProgress(batchId: string, updates: {
    status?: BatchStatus
    processedFiles?: number | null
    successfulFiles?: number | null
    failedFiles?: number | null
}): Promise<void> {
    await prisma.batchProcessing.update({
        where: { id: batchId },
        data: {
            ...updates,
            ...(updates.status === 'COMPLETED' || updates.status === 'FAILED' ? { completedAt: new Date() } : {}),
        },
    })
}

// Import the actual processing logic from invoices.ts
async function ingestBatchOutputFromGemini(batchId: string, dest: GeminiDest): Promise<void> {
    // Dynamically import the function to avoid circular dependencies
    const { ingestBatchOutputFromGemini: actualIngest } = await import('../lib/actions/invoices')
    return actualIngest(batchId, dest)
}

async function checkAndProcessBatches(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting batch cron check...`)

    try {
        // Include recently completed batches (within last 2 minutes) so we can detect completion
        const twoMinutesAgo = new Date()
        twoMinutesAgo.setMinutes(twoMinutesAgo.getMinutes() - 2)

        // Get all active batches across all users (no auth required for cron)
        const localBatches = await prisma.batchProcessing.findMany({
            where: {
                OR: [
                    {
                        status: {
                            in: ['PENDING', 'PROCESSING']
                        }
                    },
                    {
                        status: {
                            in: ['COMPLETED', 'FAILED']
                        },
                        completedAt: {
                            gte: twoMinutesAgo
                        }
                    }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            },
        })

        console.log(`Found ${localBatches.length} active/recent batches`)

        if (localBatches.length === 0) {
            console.log('No batches to process')
            return
        }

        // Process each batch using the same logic as getActiveBatches
        for (const batch of localBatches) {
            if (['PENDING', 'PROCESSING'].includes(batch.status)) {
                try {
                    console.log(`Checking Gemini status for batch ${batch.id}`)

                    // Retry logic for batch status check
                    let remote: GeminiBatchStatus | undefined
                    let attempts = 0
                    while (attempts < 3) {
                        try {
                            remote = await gemini.batches.get({ name: batch.id }) as GeminiBatchStatus
                            break
                        } catch (error: unknown) {
                            attempts++
                            if (attempts >= 3) throw error
                            if (isRateLimitError(error)) {
                                console.log(`Rate limit hit during batch status check, waiting 3s before retry ${attempts}/3`)
                                await new Promise(resolve => setTimeout(resolve, 3000))
                            } else {
                                throw error
                            }
                        }
                    }

                    // Map Gemini state → local BatchStatus
                    const state = remote?.state as string | undefined
                    const statusMap: Record<string, BatchStatus> = {
                        JOB_STATE_PENDING: 'PENDING',
                        JOB_STATE_RUNNING: 'PROCESSING',
                        JOB_STATE_SUCCEEDED: 'COMPLETED',
                        JOB_STATE_FAILED: 'FAILED',
                        JOB_STATE_EXPIRED: 'FAILED',
                        JOB_STATE_CANCELLED: 'CANCELLED',
                    }
                    const newStatus = state ? statusMap[state] ?? batch.status : batch.status

                    // Counts if present
                    const rc = (remote?.request_counts ?? remote?.requestCounts ?? {})

                    console.log(`Batch ${batch.id} status: ${batch.status} -> ${newStatus}, processed: ${rc.completed ?? 0}/${rc.failed ?? 0}`)

                    await updateBatchProgress(batch.id, {
                        status: newStatus,
                        processedFiles: rc.completed !== undefined || rc.failed !== undefined ? (rc.completed ?? 0) + (rc.failed ?? 0) : undefined,
                        successfulFiles: rc.completed,
                        failedFiles: rc.failed,
                    })

                    // If batch completed, ingest results using existing logic
                    if (newStatus === 'COMPLETED' && !batch.completedAt && remote?.dest) {
                        console.log(`Batch ${batch.id} completed, ingesting results...`)
                        await ingestBatchOutputFromGemini(batch.id, remote.dest as GeminiDest)
                    }

                } catch (err) {
                    console.error(`[checkAndProcessBatches] Failed to retrieve Gemini batch ${batch.id}:`, err)
                }
            }
        }

        console.log(`[${new Date().toISOString()}] Batch cron check completed`)

    } catch (error) {
        console.error('Error in batch cron check:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

// Run the check if this script is executed directly
if (require.main === module) {
    checkAndProcessBatches()
        .then(() => {
            console.log('Batch cron check completed successfully')
            process.exit(0)
        })
        .catch((error) => {
            console.error('Batch cron check failed:', error)
            process.exit(1)
        })
}

export { checkAndProcessBatches }
