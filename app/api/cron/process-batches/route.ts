import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/db"
import { BatchStatus } from "@/generated/prisma"
import { GoogleGenAI } from "@google/genai"
import { Prisma } from "@/generated/prisma"

// Gemini batch response interfaces
interface GeminiRequestCounts { total?: number; completed?: number; failed?: number }
interface GeminiInlineResponse { key?: string; response?: { text?: string }; error?: unknown }
type GeminiDest = { file_name?: string; fileName?: string; inlined_responses?: Array<GeminiInlineResponse>; inlinedResponses?: Array<GeminiInlineResponse> } | undefined | null;
interface GeminiBatchStatus { state?: string; request_counts?: GeminiRequestCounts; requestCounts?: GeminiRequestCounts; dest?: GeminiDest }

export async function POST(request: NextRequest) {
    try {
        // Verify API secret key for security
        const headersList = await headers()
        const authHeader = headersList.get("authorization")

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json(
                { error: "Missing or invalid authorization header" },
                { status: 401 }
            )
        }

        const token = authHeader.substring(7)
        const expectedToken = process.env.API_SECRET_KEY

        if (!expectedToken) {
            console.error("[cron/process-batches] API_SECRET_KEY not configured")
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            )
        }

        if (token !== expectedToken) {
            return NextResponse.json(
                { error: "Invalid API key" },
                { status: 401 }
            )
        }

        console.log("[cron/process-batches] Starting batch processing check...")

        // Get all active batches (this will automatically check Gemini status and ingest completed batches)
        // We need to call this for all users, not just the authenticated user
        // Since this is a cron job, we'll need to modify getActiveBatches to work without auth
        const batches = await getAllActiveBatchesForCron()

        const summary = {
            totalBatchesChecked: batches.length,
            activeBatches: batches.filter(b => b.status === 'PENDING' || b.status === 'PROCESSING').length,
            completedBatches: batches.filter(b => b.status === 'COMPLETED').length,
            failedBatches: batches.filter(b => b.status === 'FAILED').length,
            batchesProcessed: batches.filter(b => b.status === 'COMPLETED' && b.completedAt).length,
            timestamp: new Date().toISOString()
        }

        console.log("[cron/process-batches] Batch processing summary:", summary)

        return NextResponse.json({
            success: true,
            message: "Batch processing check completed",
            summary
        })

    } catch (error) {
        console.error("[cron/process-batches] Error:", error)
        return NextResponse.json(
            {
                error: "Internal server error",
                message: error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        )
    }
}

// Modified version of getActiveBatches that works for all users (cron context)
async function getAllActiveBatchesForCron() {
    // Initialize Gemini client
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
        throw new Error("Missing GEMINI_API_KEY environment variable")
    }
    const gemini = new GoogleGenAI({ apiKey: geminiApiKey })

    // Get all active batches across all users
    const localBatches = await prisma.batchProcessing.findMany({
        where: {
            status: {
                in: ['PENDING', 'PROCESSING']
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    if (localBatches.length === 0) {
        console.log("[cron/process-batches] No active batches found")
        return []
    }

    console.log(`[cron/process-batches] Found ${localBatches.length} active batches`)

    const reconciledBatches: typeof localBatches = []

    for (const batch of localBatches) {
        if (['PENDING', 'PROCESSING'].includes(batch.status)) {
            try {
                // Retry logic for batch status check
                let remote
                let attempts = 0
                while (attempts < 3) {
                    try {
                        remote = await gemini.batches.get({ name: batch.id }) as GeminiBatchStatus
                        break
                    } catch (error: unknown) {
                        attempts++
                        if (attempts >= 3) throw error
                        if (isRateLimitError(error)) {
                            await new Promise(resolve => setTimeout(resolve, 3000))
                        } else {
                            throw error
                        }
                    }
                }

                // Map Gemini state → local BatchStatus
                const state = remote?.state as string | undefined
                const statusMap: Record<string, string> = {
                    JOB_STATE_PENDING: 'PENDING',
                    JOB_STATE_RUNNING: 'PROCESSING',
                    JOB_STATE_SUCCEEDED: 'COMPLETED',
                    JOB_STATE_FAILED: 'FAILED',
                    JOB_STATE_EXPIRED: 'FAILED',
                    JOB_STATE_CANCELLED: 'CANCELLED',
                }
                const newStatus = state ? (statusMap[state] as BatchStatus) ?? batch.status : batch.status

                // Counts if present
                const rc = (remote?.request_counts ?? remote?.requestCounts ?? {})

                // Update batch progress
                await prisma.batchProcessing.update({
                    where: { id: batch.id },
                    data: {
                        status: newStatus,
                        processedFiles: rc.completed !== undefined || rc.failed !== undefined ? (rc.completed ?? 0) + (rc.failed ?? 0) : undefined,
                        successfulFiles: rc.completed,
                        failedFiles: rc.failed,
                        updatedAt: new Date(),
                    }
                })

                reconciledBatches.push({ ...batch, status: newStatus as BatchStatus, processedFiles: (rc.completed ?? 0) + (rc.failed ?? 0), successfulFiles: rc.completed ?? 0, failedFiles: rc.failed ?? 0 })

                // If batch completed, ingest results
                if (newStatus === 'COMPLETED' && !batch.completedAt && remote?.dest) {
                    console.log(`[cron/process-batches] Batch ${batch.id} completed, ingesting results...`)
                    try {
                        // Import the ingest function dynamically to avoid circular imports
                        const { ingestBatchOutputFromGemini } = await import("@/lib/actions/invoices")
                        await ingestBatchOutputFromGemini(batch.id, remote.dest)
                        console.log(`[cron/process-batches] Successfully ingested results for batch ${batch.id}`)
                    } catch (ingestError) {
                        console.error(`[cron/process-batches] Failed to ingest results for batch ${batch.id}:`, ingestError)

                        // Save error to batch record
                        const errorMessage = ingestError instanceof Error ? ingestError.message : 'Unknown error during ingestion'
                        await prisma.batchProcessing.update({
                            where: { id: batch.id },
                            data: {
                                errors: [`Batch ingestion error: ${errorMessage}`] as unknown as Prisma.InputJsonValue,
                                status: 'FAILED',
                                completedAt: new Date(),
                            }
                        })
                    }
                }

                continue
            } catch (err) {
                console.error('[cron/process-batches] Failed to retrieve Gemini batch', batch.id, err)
            }
        }

        reconciledBatches.push(batch)
    }

    return reconciledBatches.map(batch => ({
        id: batch.id,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        successfulFiles: batch.successfulFiles,
        failedFiles: batch.failedFiles,
        blockedFiles: batch.blockedFiles,
        currentFile: batch.currentFile || undefined,
        estimatedCompletion: batch.estimatedCompletion || undefined,
        startedAt: batch.startedAt || undefined,
        completedAt: batch.completedAt || undefined,
        errors: batch.errors ? JSON.parse(JSON.stringify(batch.errors)) : undefined,
    }))
}

// Helper function to check for rate limit errors
function isRateLimitError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
        const err = error as { status?: number; code?: number; message?: string }
        return (err.status === 429) ||
            (err.code === 429) ||
            Boolean(err.message && err.message.includes('rate limit')) ||
            Boolean(err.message && err.message.includes('quota exceeded'))
    }
    return false
}
