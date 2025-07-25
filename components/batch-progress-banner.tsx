"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, FileText } from "lucide-react"
import { useBatchProgress } from "@/hooks/use-analytics"
import { toast } from "sonner"

export function BatchProgressBanner() {
    const { data: batches = [], isLoading } = useBatchProgress()
    const previousBatchesRef = useRef<typeof batches>([])
    // Tracks if the banner is currently visible so we only emit the
    // "batchBannerVisible" event once per visibility change.
    const bannerShownRef = useRef(false)
    const [expectedTotal, setExpectedTotal] = useState<number | null>(null)

    // Handle batch completion detection and notifications
    useEffect(() => {
        if (isLoading || batches.length === 0) return

        const previousBatches = previousBatchesRef.current
        const newlyCompletedBatches = previousBatches.filter(prevBatch =>
            prevBatch.status === 'PROCESSING' &&
            batches.find(batch =>
                batch.id === prevBatch.id &&
                (batch.status === 'COMPLETED' || batch.status === 'FAILED')
            )
        )

        // If batches completed, show notification and reload page immediately
        if (newlyCompletedBatches.length > 0) {
            const completedBatch = newlyCompletedBatches[0]
            const currentBatch = batches.find(b => b.id === completedBatch.id)

            console.log('Batch completed detected:', {
                batchId: completedBatch.id,
                status: currentBatch?.status,
                successfulFiles: currentBatch?.successfulFiles
            });

            if (currentBatch?.status === 'COMPLETED') {
                toast.success("Procesamiento completado", {
                    description: `${currentBatch.successfulFiles} facturas procesadas exitosamente. Recargando página...`
                })
            } else if (currentBatch?.status === 'FAILED') {
                toast.error("Procesamiento fallido", {
                    description: "Hubo un error durante el procesamiento. Recargando página..."
                })
            }

            // Reload page immediately to show the new invoices
            setTimeout(() => {
                console.log('Reloading page after batch completion...');
                window.location.reload()
            }, 1000) // Reduced from 2000ms to 1000ms
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

    // Listen for custom events
    useEffect(() => {
        // Listen for custom event to immediately refresh when a new batch is created
        function handleBatchCreated(e: Event) {
            const detail = (e as CustomEvent<{ totalFiles: number }>).detail
            if (detail?.totalFiles) {
                setExpectedTotal(detail.totalFiles)
            }
            console.log('Batch created event received, will be refreshed by TanStack Query polling...')
        }

        window.addEventListener('batchCreated', handleBatchCreated)

        return () => {
            window.removeEventListener('batchCreated', handleBatchCreated)
        }
    }, [])

    // Filter active batches
    const activeBatches = batches.filter(batch =>
        batch.status === 'PENDING' || batch.status === 'PROCESSING'
    )

    // Aggregate the total number of files across all active batches so the user
    // only sees a single banner (e.g. "Procesando 215 facturas") incluso antes
    // de que todos los batches estén registrados en la BD.
    const aggregated = activeBatches.reduce((sum, b) => sum + (b.totalFiles ?? 0), 0)
    const totalFiles = expectedTotal && expectedTotal > aggregated ? expectedTotal : aggregated

    // Emitimos evento cuando alcanzamos el total esperado
    useEffect(() => {
        if (expectedTotal && aggregated >= expectedTotal) {
            window.dispatchEvent(new CustomEvent('batchBannerReady'))
            setExpectedTotal(null)
        }
    }, [aggregated, expectedTotal])

    // Show nothing while the very first fetch is in-flight.
    if (isLoading) return null

    // If we have no active batches *and* no optimistic expectation, hide the banner.
    // Having an `expectedTotal` means the client just queued a batch locally, so we
    // still render the banner right away for instant feedback, even before the
    // server has persisted the record.
    if (activeBatches.length === 0 && (expectedTotal === null || expectedTotal === 0)) {
        return null
    }

    return (
        <div className="mb-6">
            <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        <FileText className="h-5 w-5 text-blue-600" />
                        <span className="font-medium text-base">
                            Procesando {totalFiles} factura{totalFiles !== 1 ? 's' : ''}
                        </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 