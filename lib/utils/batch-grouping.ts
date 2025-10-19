import type { BatchErrorDetail } from "@/lib/actions/invoices"
import type { BatchProgressInfo } from "@/lib/actions/invoices"

export interface GroupBatchesOptions {
    timeWindowMs?: number
    maxGroups?: number
}

export function groupBatchesByTimeWindow(
    batches: Array<BatchProgressInfo | (BatchProgressInfo & { createdAt: Date })>,
    options: GroupBatchesOptions = {}
): BatchProgressInfo[] {
    const TIME_WINDOW_MS = options.timeWindowMs ?? 5 * 60 * 1000
    const MAX_GROUPS = options.maxGroups ?? 10

    if (!Array.isArray(batches) || batches.length === 0) return []

    const sorted = [...batches].sort((a, b) => {
        const aTime = (a).createdAt ? new Date((a).createdAt).getTime() : new Date().getTime()
        const bTime = (b).createdAt ? new Date((b).createdAt).getTime() : new Date().getTime()
        return bTime - aTime
    })

    const sessions: BatchProgressInfo[] = []

    for (const batch of sorted) {
        const createdAt: Date = (batch).createdAt ?? new Date()

        const existing = sessions.find(s => Math.abs(s.createdAt.getTime() - createdAt.getTime()) <= TIME_WINDOW_MS)

        if (existing) {
            existing.totalFiles += batch.totalFiles || 0
            existing.processedFiles += batch.processedFiles || 0
            existing.successfulFiles += batch.successfulFiles || 0
            existing.failedFiles += batch.failedFiles || 0
            existing.blockedFiles += batch.blockedFiles || 0

            if (batch.status === 'PROCESSING' || batch.status === 'PENDING') {
                existing.status = 'PROCESSING'
            } else if (batch.status === 'FAILED' && existing.status !== 'PROCESSING') {
                existing.status = 'FAILED'
            } else if (batch.status === 'COMPLETED' && existing.status !== 'PROCESSING' && existing.status !== 'FAILED') {
                existing.status = 'COMPLETED'
            }

            if (!existing.startedAt || (batch.startedAt && batch.startedAt < existing.startedAt)) {
                existing.startedAt = batch.startedAt
            }
            if (!existing.completedAt || (batch.completedAt && batch.completedAt > existing.completedAt)) {
                existing.completedAt = batch.completedAt
            }

            if (Array.isArray(batch.errors) && batch.errors.length > 0) {
                if (!existing.errors) existing.errors = []
                existing.errors.push(...(batch.errors as BatchErrorDetail[]))
            }
        } else {
            sessions.push({
                id: `session-${createdAt.getTime()}`,
                status: batch.status,
                totalFiles: batch.totalFiles || 0,
                processedFiles: batch.processedFiles || 0,
                successfulFiles: batch.successfulFiles || 0,
                failedFiles: batch.failedFiles || 0,
                blockedFiles: batch.blockedFiles || 0,
                currentFile: batch.currentFile,
                estimatedCompletion: batch.estimatedCompletion,
                startedAt: batch.startedAt,
                completedAt: batch.completedAt,
                createdAt,
                errors: Array.isArray(batch.errors) ? (batch.errors as BatchErrorDetail[]) : undefined,
            })
        }
    }

    return sessions.slice(0, MAX_GROUPS)
}


