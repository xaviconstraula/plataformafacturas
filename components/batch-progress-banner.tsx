"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, FileText } from "lucide-react"
import { useBatchProgress } from "@/hooks/use-analytics"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BatchErrorsDialog } from "@/components/batch-errors-dialog"
import { getBatchById } from "@/lib/actions/invoices"
import type { BatchProgressInfo } from "@/lib/actions/invoices"

function areAllErrorsDuplicates(errors?: { kind: string }[]): boolean {
    if (!errors || errors.length === 0) return false
    return errors.every(error => error.kind === 'DUPLICATE_INVOICE')
}

function getErrorDescription(successfulFiles: number, failedFiles: number, errors?: { kind: string }[]): string {
    const areAllDuplicates = areAllErrorsDuplicates(errors)
    const errorType = areAllDuplicates ? 'duplicadas' : 'errores'
    return `${successfulFiles} facturas procesadas, ${failedFiles} ${errorType}`
}

export function BatchProgressBanner() {
    const queryClient = useQueryClient()
    const { data: batches = [], isLoading, refetch } = useBatchProgress()
    const previousBatchesRef = useRef<typeof batches>([])
    const bannerShownRef = useRef(false)
    const shownNotificationsRef = useRef<Set<string>>(new Set())
    const [expectedTotal, setExpectedTotal] = useState<number | null>(null)
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [selectedBatchIdForErrors, setSelectedBatchIdForErrors] = useState<string | null>(null)
    const [fetchedBatch, setFetchedBatch] = useState<BatchProgressInfo | null>(null)

    // Get the currently selected batch with fresh data from the latest batches array
    // If not found, use the fetched batch as fallback
    const selectedBatchForErrors = selectedBatchIdForErrors
        ? (batches.find(b => b.id === selectedBatchIdForErrors) || fetchedBatch)
        : null


    // Fetch batch from database if not in current list
    useEffect(() => {
        if (selectedBatchIdForErrors && !batches.find(b => b.id === selectedBatchIdForErrors)) {
            console.log('[BatchProgressBanner] Batch not in current list, fetching from DB:', selectedBatchIdForErrors)
            getBatchById(selectedBatchIdForErrors).then(batch => {
                if (batch) {
                    console.log('[BatchProgressBanner] Fetched batch from DB:', {
                        id: batch.id,
                        errorCount: batch.errors?.length ?? 0,
                        failedFiles: batch.failedFiles
                    })
                    setFetchedBatch(batch)
                } else {
                    console.error('[BatchProgressBanner] Batch not found in DB:', selectedBatchIdForErrors)
                    toast.error('No se pudo cargar la información de errores del batch')
                }
            }).catch(err => {
                console.error('[BatchProgressBanner] Error fetching batch:', err)
                toast.error('Error al cargar la información de errores')
            })
        }
    }, [selectedBatchIdForErrors, batches])

    // Log dialog state changes for debugging
    useEffect(() => {
        console.log('[BatchProgressBanner] Dialog state changed:', {
            errorDialogOpen,
            selectedBatchIdForErrors,
            batchFound: selectedBatchForErrors !== null,
            batchHasErrors: selectedBatchForErrors?.errors?.length ?? 0
        })
    }, [errorDialogOpen, selectedBatchIdForErrors, selectedBatchForErrors])

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

            const failedFiles = currentBatch?.failedFiles || 0
            const successfulFiles = currentBatch?.successfulFiles || 0

            if (failedFiles > 0 || (currentBatch.errors?.length ?? 0) > 0) {
                const areAllDuplicates = areAllErrorsDuplicates(currentBatch.errors)
                const toastTitle = areAllDuplicates ? "Procesamiento completado con duplicadas" : "Procesamiento completado con errores"

                toast.warning(toastTitle, {
                    description: getErrorDescription(successfulFiles, failedFiles, currentBatch.errors),
                    duration: Infinity,
                    action: {
                        label: "Ver detalles",
                        onClick: () => {
                            console.log('[Toast Action] Ver detalles clicked for batch:', currentBatch.id)
                            console.log('[Toast Action] Current batch has errors:', currentBatch.errors?.length ?? 0)
                            console.log('[Toast Action] Setting state - batchId:', currentBatch.id, 'dialogOpen: true')
                            // Use batch ID instead of the batch object to always get fresh data
                            setSelectedBatchIdForErrors(currentBatch.id)
                            setErrorDialogOpen(true)
                            console.log('[Toast Action] State updated')
                        }
                    }
                })
                shownNotificationsRef.current.add(currentBatch.id)
            } else {
                toast.success("Procesamiento completado", {
                    description: `${successfulFiles} facturas procesadas exitosamente. Recargando página...`
                })
                setTimeout(() => {
                    window.location.reload()
                }, 1000)
            }
        }

        // Track recently completed batches that have errors and haven't been notified
        const recentCompletedBatches = batches.filter(batch => {
            const isRecentlyCompleted = (batch.status === 'COMPLETED' || batch.status === 'FAILED') && batch.completedAt &&
                (new Date().getTime() - new Date(batch.completedAt).getTime()) < (5 * 60 * 1000)
            const hasErrors = (batch.errors && batch.errors.length > 0) || (batch.failedFiles && batch.failedFiles > 0)
            const notNotified = !shownNotificationsRef.current.has(batch.id)
            return isRecentlyCompleted && hasErrors && notNotified
        })

        recentCompletedBatches.forEach(batch => {
            const failedFiles = batch.failedFiles || 0
            const successfulFiles = batch.successfulFiles || 0

            const areAllDuplicates = areAllErrorsDuplicates(batch.errors)
            const toastTitle = areAllDuplicates ? "Procesamiento completado con duplicadas" : "Procesamiento completado con errores"

            toast.warning(toastTitle, {
                description: getErrorDescription(successfulFiles, failedFiles, batch.errors),
                duration: Infinity,
                action: {
                    label: "Ver detalles",
                    onClick: () => {
                        console.log('[Toast Action - Recent] Ver detalles clicked for batch:', batch.id)
                        console.log('[Toast Action - Recent] Batch has errors:', batch.errors?.length ?? 0)
                        console.log('[Toast Action - Recent] Setting state - batchId:', batch.id, 'dialogOpen: true')
                        // Use batch ID instead of the batch object to always get fresh data
                        setSelectedBatchIdForErrors(batch.id)
                        setErrorDialogOpen(true)
                        console.log('[Toast Action - Recent] State updated')
                    }
                }
            })

            shownNotificationsRef.current.add(batch.id)
        })

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

    // Close dialog and clear selection
    const handleCloseDialog = () => {
        setErrorDialogOpen(false)
        setSelectedBatchIdForErrors(null)
        setFetchedBatch(null)
    }

    // Show nothing while the very first fetch is in-flight.
    if (isLoading) return null

    // If we have no active batches and no optimistic expectation, hide the banner (but not the dialog).
    const shouldShowBanner = activeBatches.length > 0 || (expectedTotal !== null && expectedTotal > 0)

    return (
        <>
            {shouldShowBanner && (
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
            )}

            {errorDialogOpen && selectedBatchIdForErrors ? (
                <BatchErrorsDialog
                    isOpen={errorDialogOpen}
                    onClose={handleCloseDialog}
                    batchId={selectedBatchIdForErrors}
                    errors={selectedBatchForErrors?.errors || []}
                    failedFiles={selectedBatchForErrors?.failedFiles || 0}
                    totalFiles={selectedBatchForErrors?.totalFiles || 0}
                />
            ) : null}
        </>
    )
} 