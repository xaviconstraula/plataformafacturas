"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, FileText } from "lucide-react"
import { getActiveBatches, type BatchProgressInfo } from "@/lib/actions/invoices"
import { toast } from "sonner"

export function BatchProgressBanner() {
    const [activeBatches, setActiveBatches] = useState<BatchProgressInfo[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const previousBatchesRef = useRef<BatchProgressInfo[]>([])

    // Poll for batch updates every 3 seconds
    useEffect(() => {
        const fetchBatches = async () => {
            try {
                const batches = await getActiveBatches()

                // Check if any batches just completed
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
                );

                setActiveBatches(activeBatchesOnly)
                previousBatchesRef.current = batches // Keep all batches for completion detection
            } catch (error) {
                console.error("Error fetching batch progress:", error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchBatches()
        const interval = setInterval(fetchBatches, 3000) // Poll every 3 seconds instead of 5

        return () => clearInterval(interval)
    }, [])

    if (isLoading) {
        return null // Don't show anything while loading
    }

    if (activeBatches.length === 0) {
        return null // No active batches to show
    }

    return (
        <div className="space-y-3 mb-6">
            {activeBatches.map((batch) => (
                <Card key={batch.id} className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                            <FileText className="h-5 w-5 text-blue-600" />
                            <span className="font-medium text-base">
                                Procesando {batch.totalFiles} facturas
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
} 