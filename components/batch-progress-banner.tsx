"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, FileText, AlertCircle } from "lucide-react"
import { useBatchProgress } from "@/hooks/use-analytics"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BatchErrorsDialog } from "@/components/batch-errors-dialog"

export function BatchProgressBanner() {
    const queryClient = useQueryClient()
    const { data: batches = [], isLoading, refetch } = useBatchProgress()
    const previousBatchesRef = useRef<typeof batches>([])
    const bannerShownRef = useRef(false)
    const [expectedTotal, setExpectedTotal] = useState<number | null>(null)
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [selectedBatchForErrors, setSelectedBatchForErrors] = useState<typeof batches[0] | null>(null)

    // Handle batch completion detection and notifications
    useEffect(() => {
        if (isLoading || batches.length === 0) return

        console.log('Checking batch status:', {
            totalBatches: batches.length,
            batchStatuses: batches.map(b => ({ id: b.id, status: b.status, errors: b.errors?.length })),
            activeBatches: batches.filter(b => b.status === 'PENDING' || b.status === 'PROCESSING').length
        })

        const previousBatches = previousBatchesRef.current

        // Detect newly completed or failed batches
        // This includes:
        // 1. Batches that transitioned from PROCESSING to COMPLETED/FAILED
        // 2. Batches that are newly FAILED (e.g., failed during PENDING state)
        const newlyCompletedBatches = previousBatches.filter(prevBatch =>
            (prevBatch.status === 'PROCESSING' || prevBatch.status === 'PENDING') &&
            batches.find(batch =>
                batch.id === prevBatch.id &&
                (batch.status === 'COMPLETED' || batch.status === 'FAILED')
            )
        ).concat(
            // Also catch batches that are FAILED but we haven't seen before
            batches.filter(batch =>
                batch.status === 'FAILED' &&
                !previousBatches.find(pb => pb.id === batch.id)
            )
        )

        // If batches completed, show notification
        if (newlyCompletedBatches.length > 0) {
            const completedBatch = newlyCompletedBatches[0]
            const currentBatch = batches.find(b => b.id === completedBatch.id)

            if (!currentBatch) return

            console.log('Batch completion detected:', {
                batchId: completedBatch.id,
                status: currentBatch.status,
                successfulFiles: currentBatch.successfulFiles,
                failedFiles: currentBatch.failedFiles,
                hasErrors: currentBatch.errors && currentBatch.errors.length > 0
            })

            if (currentBatch.status === 'COMPLETED') {
                const failedFiles = currentBatch?.failedFiles || 0
                const successfulFiles = currentBatch?.successfulFiles || 0

                if (failedFiles > 0) {
                    // Batch completed with some failures
                    toast.warning("Procesamiento completado con errores", {
                        description: `${successfulFiles} facturas procesadas, ${failedFiles} con errores`,
                        duration: Infinity,
                        action: {
                            label: "Ver errores",
                            onClick: () => {
                                setSelectedBatchForErrors(currentBatch)
                                setErrorDialogOpen(true)
                            }
                        }
                    })
                } else {
                    // All successful
                    toast.success("Procesamiento completado", {
                        description: `${successfulFiles} facturas procesadas exitosamente. Recargando página...`
                    })
                }
            } else if (currentBatch.status === 'FAILED') {
                toast.error("Procesamiento fallido", {
                    description: "Hubo un error durante el procesamiento",
                    duration: Infinity,
                    action: {
                        label: "Ver errores",
                        onClick: () => {
                            setSelectedBatchForErrors(currentBatch)
                            setErrorDialogOpen(true)
                        }
                    }
                })
            }

            // Only reload if batch was fully successful (no failures)
            if (currentBatch.status === 'COMPLETED' && (currentBatch?.failedFiles || 0) === 0) {
                setTimeout(() => {
                    console.log('Reloading page after batch completion...')
                    window.location.reload()
                }, 1000)
            }
        }

        // Only show batches that are actually active (not completed)
        const activeBatchesOnly = batches.filter(batch =>
            batch.status === 'PENDING' || batch.status === 'PROCESSING'
        )

        // 🚀  Notify listeners (e.g. upload button) once the banner
        //     becomes visible so they can stop showing their own loaders.
        if (activeBatchesOnly.length > 0 && !bannerShownRef.current) {
            window.dispatchEvent(new CustomEvent('batchBannerVisible', { detail: { currentTotal: activeBatchesOnly.reduce((s, b) => s + (b.totalFiles ?? 0), 0) } }))
            bannerShownRef.current = true
        } else if (activeBatchesOnly.length === 0 && bannerShownRef.current) {
            // Reset when no active batches so we can trigger again later.
            bannerShownRef.current = false
        }

        previousBatchesRef.current = batches // Keep all batches for completion detection
    }, [batches, isLoading])

    // Listen for custom events and force refetch when needed
    useEffect(() => {
        // Listen for custom event to immediately refresh when a new batch is created
        function handleBatchCreated(e: Event) {
            const detail = (e as CustomEvent<{ totalFiles: number }>).detail
            if (detail?.totalFiles) {
                setExpectedTotal(detail.totalFiles)
            }
            console.log('Batch created event received, forcing refetch...')
            // Force immediate refetch to pick up new batch
            refetch()
        }

        window.addEventListener('batchCreated', handleBatchCreated)

        return () => {
            window.removeEventListener('batchCreated', handleBatchCreated)
        }
    }, [refetch])

    // Filter active batches
    const activeBatches = batches.filter(batch =>
        batch.status === 'PENDING' || batch.status === 'PROCESSING'
    )

    // Aggregate the total number of files across all active batches
    const aggregated = activeBatches.reduce((sum, b) => sum + (b.totalFiles ?? 0), 0)
    const totalFiles = expectedTotal && expectedTotal > aggregated ? expectedTotal : aggregated

    // Emit event when we reach the expected total
    useEffect(() => {
        if (expectedTotal && aggregated >= expectedTotal) {
            window.dispatchEvent(new CustomEvent('batchBannerReady'))
            setExpectedTotal(null)
        }
    }, [aggregated, expectedTotal])

    // Show nothing while the very first fetch is in-flight.
    if (isLoading) return null

    // If we have no active batches and no optimistic expectation, hide the banner.
    if (activeBatches.length === 0 && (expectedTotal === null || expectedTotal === 0)) {
        return null
    }

    return (
        <>
            <div className="mb-6">
                <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                                <FileText className="h-5 w-5 text-blue-600" />
                                <span className="font-medium text-base">
                                    Procesando {totalFiles} factura{totalFiles !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {selectedBatchForErrors ? (
                <>
                    {console.log('Rendering BatchErrorsDialog with batch:', selectedBatchForErrors)}
                    <BatchErrorsDialog
                        isOpen={errorDialogOpen}
                        onClose={() => {
                            setErrorDialogOpen(false)
                            setSelectedBatchForErrors(null)
                        }}
                        batchId={selectedBatchForErrors.id}
                        errors={(selectedBatchForErrors.errors as string[]) || []}
                        failedFiles={selectedBatchForErrors.failedFiles || 0}
                        totalFiles={selectedBatchForErrors.totalFiles || 0}
                    />
                </>
            ) : null}
        </>
    )
} 