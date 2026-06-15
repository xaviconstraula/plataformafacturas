"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle, XCircle, Clock, FileText, ChevronDown, ChevronUp, RotateCcw, Loader2, ScanSearch, FileSearch } from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import { BatchErrorsDialog } from "@/components/batch-errors-dialog"
import { BatchReanalysisDialog } from "@/components/batch-reanalysis-dialog"
import { BatchProgressIndicator } from "@/components/batch-progress-indicator"
import { getBatchHistory, retryBatchSession, cancelBatchSession, startReanalyzeBatchSessionAction } from "@/lib/actions/invoices"
import type { BatchProgressInfo, ReanalysisJobInfo } from "@/lib/actions/invoices"
import { useActiveReanalysisJobs } from "@/hooks/use-analytics"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { BatchReanalysisReport } from "@/lib/invoice-extraction"
import { toast } from "sonner"

const statusConfig = {
    PENDING: { label: "Pendiente", icon: Clock, variant: "secondary" as const, color: "text-yellow-600" },
    PROCESSING: { label: "Procesando", icon: Clock, variant: "secondary" as const, color: "text-blue-600" },
    COMPLETED: { label: "Completado", icon: CheckCircle, variant: "default" as const, color: "text-green-600" },
    FAILED: { label: "Fallido", icon: XCircle, variant: "destructive" as const, color: "text-red-600" },
    CANCELLED: { label: "Cancelado", icon: XCircle, variant: "outline" as const, color: "text-gray-600" },
}

function BatchHistoryItem({
    batch,
    onViewErrors,
    onRetry,
    isRetrying,
    onCancel,
    isCancelling,
    onReanalyze,
    isStartingReanalysis,
    reanalysisJob,
    onViewReanalysisReport,
}: {
    batch: BatchProgressInfo
    onViewErrors: (batch: BatchProgressInfo) => void
    onRetry?: (batch: BatchProgressInfo) => void
    isRetrying?: boolean
    onCancel?: (batch: BatchProgressInfo) => void
    isCancelling?: boolean
    onReanalyze?: (batch: BatchProgressInfo) => void
    isStartingReanalysis?: boolean
    reanalysisJob?: ReanalysisJobInfo | null
    onViewReanalysisReport?: (batch: BatchProgressInfo, report: BatchReanalysisReport) => void
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const config = statusConfig[batch.status]

    const duplicateCount = batch.errors?.filter(e => e.kind === 'DUPLICATE_INVOICE').length ?? 0
    const actualErrorCount = batch.errors?.filter(e => e.kind !== 'DUPLICATE_INVOICE').length ?? 0
    const hasErrors = actualErrorCount > 0 || (batch.failedFiles ?? 0) > 0
    const hasDuplicates = duplicateCount > 0
    const canRetry = !!onRetry && (batch.status === 'FAILED' || (batch.status === 'COMPLETED' && hasErrors))
    const canCancel = !!onCancel && (batch.status === 'PENDING' || batch.status === 'PROCESSING')
    const canReanalyze = !!onReanalyze && batch.status === 'COMPLETED'
    const isProcessing = batch.status === 'PENDING' || batch.status === 'PROCESSING'
    const isReanalysisRunning = reanalysisJob?.status === 'PENDING' || reanalysisJob?.status === 'PROCESSING'
    const hasReanalysisReport = reanalysisJob?.status === 'COMPLETED' && !!reanalysisJob.report

    return (
        <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                                {batch.id.startsWith('session-') ? 'Sesión de carga' : `Batch ${batch.id.slice(-8)}`}
                            </span>
                            <Badge variant={config.variant} className="text-xs">
                                {config.label}
                            </Badge>
                            {hasErrors && (
                                <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                                    {actualErrorCount} errores
                                </Badge>
                            )}
                            {hasDuplicates && (
                                <Badge variant="outline" className="text-xs text-orange-600 border-orange-200">
                                    {duplicateCount} duplicadas
                                </Badge>
                            )}
                            {isProcessing ? (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />
                                    Procesando {batch.processedFiles}/{batch.totalFiles}
                                </Badge>
                            ) : null}
                            {isReanalysisRunning ? (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />
                                    Reanalizando {reanalysisJob.processedFiles}/{reanalysisJob.totalFiles}
                                </Badge>
                            ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground mt-3">
                            {batch.totalFiles} archivos • {formatDateTime(batch.createdAt)}
                        </div>
                        {isProcessing ? (
                            <div className="mt-2 max-w-md">
                                <BatchProgressIndicator
                                    processedFiles={batch.processedFiles}
                                    totalFiles={batch.totalFiles}
                                    currentFile={batch.currentFile}
                                />
                            </div>
                        ) : null}
                        {isReanalysisRunning ? (
                            <div className="mt-2 max-w-md">
                                <BatchProgressIndicator
                                    processedFiles={reanalysisJob.processedFiles}
                                    totalFiles={reanalysisJob.totalFiles}
                                    currentFile={reanalysisJob.currentFile}
                                    label="Reanalizando"
                                />
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(hasErrors || hasDuplicates) && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewErrors(batch)}
                            className="text-xs"
                        >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {hasErrors ? 'Ver errores' : 'Ver duplicadas'}
                        </Button>
                    )}
                    {hasReanalysisReport ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewReanalysisReport?.(batch, reanalysisJob.report!)}
                            className="text-xs"
                        >
                            <FileSearch className="h-3 w-3 mr-1" />
                            Ver informe
                        </Button>
                    ) : null}
                    {canReanalyze ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReanalyze?.(batch)}
                            className="text-xs"
                            disabled={isStartingReanalysis || isReanalysisRunning}
                            title="Vuelve a escanear los PDFs del lote y compara con lo guardado"
                        >
                            {isStartingReanalysis || isReanalysisRunning ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <ScanSearch className="h-3 w-3 mr-1" />
                            )}
                            Reanalizar escaneo
                        </Button>
                    ) : null}
                    {canRetry && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onRetry?.(batch)}
                            className="text-xs"
                            disabled={isRetrying}
                        >
                            {isRetrying ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <RotateCcw className="h-3 w-3 mr-1" />
                            )}
                            Reintentar
                        </Button>
                    )}
                    {canCancel && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onCancel?.(batch)}
                            className="text-xs"
                            disabled={isCancelling}
                        >
                            {isCancelling ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                            )}
                            Cancelar
                        </Button>
                    )}
                    {(batch.status === 'COMPLETED' || batch.status === 'FAILED') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="h-6 w-6 p-0"
                        >
                            {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : (
                                <ChevronDown className="h-3 w-3" />
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {isExpanded && (batch.status === 'COMPLETED' || batch.status === 'FAILED') && (
                <div className="pt-2 border-t space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-green-600">
                            ✓ {batch.successfulFiles ?? 0} exitosos
                        </div>
                        <div className="text-blue-600">
                            {batch.totalFiles && batch.totalFiles > 0
                                ? Math.round(((batch.successfulFiles ?? 0) / batch.totalFiles) * 100)
                                : 0}% éxito
                        </div>
                    </div>
                    {(hasErrors || hasDuplicates) && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {hasErrors && (
                                <div className="text-red-600">
                                    ✗ {actualErrorCount} errores
                                </div>
                            )}
                            {hasDuplicates && (
                                <div className="text-orange-600">
                                    ◉ {duplicateCount} duplicadas
                                </div>
                            )}
                        </div>
                    )}
                    {batch.completedAt && (
                        <div className="text-xs text-muted-foreground">
                            Completado: {formatDateTime(batch.completedAt)}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function buildReanalysisJobMap(jobs: ReanalysisJobInfo[]): Map<string, ReanalysisJobInfo> {
    const map = new Map<string, ReanalysisJobInfo>()
    for (const job of jobs) {
        if (!map.has(job.batchOrSessionId)) {
            map.set(job.batchOrSessionId, job)
        }
    }
    return map
}

export function BatchHistoryCard() {
    const [errorsDialogOpen, setErrorsDialogOpen] = useState(false)
    const [selectedBatchData, setSelectedBatchData] = useState<BatchProgressInfo | null>(null)
    const [retryingBatchId, setRetryingBatchId] = useState<string | null>(null)
    const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null)
    const [startingReanalysisBatchId, setStartingReanalysisBatchId] = useState<string | null>(null)
    const [reanalysisDialogOpen, setReanalysisDialogOpen] = useState(false)
    const [reanalysisBatchId, setReanalysisBatchId] = useState<string | null>(null)
    const [reanalysisReport, setReanalysisReport] = useState<BatchReanalysisReport | null>(null)
    const [reanalysisError, setReanalysisError] = useState<string | null>(null)
    const queryClient = useQueryClient()
    const previousReanalysisJobsRef = useRef<ReanalysisJobInfo[]>([])
    const shownReanalysisNotificationsRef = useRef<Set<string>>(new Set())

    const { data: batches = [], isLoading, error } = useQuery({
        queryKey: ['batch-history'],
        queryFn: async () => {
            return await getBatchHistory()
        },
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchInterval: (query) => {
            const hasActiveProcessing = query.state.data?.some(
                (batch) => batch.status === 'PENDING' || batch.status === 'PROCESSING',
            )
            return hasActiveProcessing ? 5000 : false
        },
    })

    const { data: reanalysisJobs = [] } = useActiveReanalysisJobs()
    const reanalysisJobMap = useMemo(() => buildReanalysisJobMap(reanalysisJobs), [reanalysisJobs])

    useEffect(() => {
        if (reanalysisJobs.length === 0) return

        const previousJobs = previousReanalysisJobsRef.current
        const newlyCompletedJobs = previousJobs.filter((prevJob) => {
            const currentJob = reanalysisJobs.find((job) => job.id === prevJob.id)
            return currentJob
                && (prevJob.status === 'PENDING' || prevJob.status === 'PROCESSING')
                && (currentJob.status === 'COMPLETED' || currentJob.status === 'FAILED')
        })

        for (const job of newlyCompletedJobs) {
            if (shownReanalysisNotificationsRef.current.has(job.id)) {
                continue
            }

            const currentJob = reanalysisJobs.find((current) => current.id === job.id)
            if (!currentJob) continue

            shownReanalysisNotificationsRef.current.add(job.id)

            if (currentJob.status === 'COMPLETED' && currentJob.report) {
                toast.success("Informe de reanálisis listo", {
                    description: `${currentJob.report.matchedCount} iguales, ${currentJob.report.diffCount} con diferencias, ${currentJob.report.minorDiffCount ?? 0} menores`,
                    action: {
                        label: "Ver informe",
                        onClick: () => {
                            setReanalysisBatchId(currentJob.batchOrSessionId)
                            setReanalysisReport(currentJob.report!)
                            setReanalysisError(null)
                            setReanalysisDialogOpen(true)
                        },
                    },
                })
            } else if (currentJob.status === 'FAILED') {
                toast.error("No se pudo completar el reanálisis", {
                    description: currentJob.error ?? 'Ocurrió un error inesperado durante el reanálisis.',
                })
            }
        }

        previousReanalysisJobsRef.current = reanalysisJobs
    }, [reanalysisJobs])

    const handleViewErrors = (batch: BatchProgressInfo) => {
        setSelectedBatchData(batch)
        setErrorsDialogOpen(true)
    }

    const handleCloseErrorsDialog = () => {
        setErrorsDialogOpen(false)
        setSelectedBatchData(null)
    }

    const handleRetryBatch = async (batch: BatchProgressInfo) => {
        setRetryingBatchId(batch.id)
        try {
            await retryBatchSession(batch.id)
            toast.success("Reintento iniciado", {
                description: "Se ha iniciado un nuevo procesamiento para este lote. El progreso aparecerá en la parte superior.",
            })
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['batch-history'] }),
                queryClient.invalidateQueries({ queryKey: ['batch-progress'] }),
            ])
        } catch (err) {
            console.error('[BatchHistoryCard] Error retrying batch session', err)
            const description = err instanceof Error ? err.message : 'Ocurrió un error inesperado al reintentar el lote.'
            toast.error("No se pudo reintentar el proceso", { description })
        } finally {
            setRetryingBatchId(null)
        }
    }

    const handleCancelBatch = async (batch: BatchProgressInfo) => {
        setCancellingBatchId(batch.id)
        try {
            const result = await cancelBatchSession(batch.id)
            if (result.success) {
                toast.success("Proceso cancelado", {
                    description: result.message,
                })
            } else {
                toast.error("No se pudo cancelar el proceso", {
                    description: result.message,
                })
            }
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['batch-history'] }),
                queryClient.invalidateQueries({ queryKey: ['batch-progress'] }),
            ])
        } catch (err) {
            console.error('[BatchHistoryCard] Error cancelling batch/session', err)
            const description = err instanceof Error ? err.message : 'Ocurrió un error inesperado al cancelar el proceso.'
            toast.error("No se pudo cancelar el proceso", { description })
        } finally {
            setCancellingBatchId(null)
        }
    }

    const handleCloseReanalysisDialog = () => {
        setReanalysisDialogOpen(false)
        setReanalysisBatchId(null)
        setReanalysisReport(null)
        setReanalysisError(null)
    }

    const handleViewReanalysisReport = (batch: BatchProgressInfo, report: BatchReanalysisReport) => {
        setReanalysisBatchId(batch.id)
        setReanalysisReport(report)
        setReanalysisError(null)
        setReanalysisDialogOpen(true)
    }

    const handleReanalyzeBatch = async (batch: BatchProgressInfo) => {
        setStartingReanalysisBatchId(batch.id)
        try {
            await startReanalyzeBatchSessionAction(batch.id)
            toast.success("Reanálisis iniciado en segundo plano", {
                description: "Puedes seguir navegando. Te avisaremos cuando el informe esté listo.",
            })
            await queryClient.invalidateQueries({ queryKey: ['reanalysis-jobs'] })
        } catch (err) {
            console.error('[BatchHistoryCard] Error starting batch reanalysis', err)
            const description = err instanceof Error ? err.message : 'Ocurrió un error inesperado al iniciar el reanálisis.'
            toast.error("No se pudo iniciar el reanálisis", { description })
        } finally {
            setStartingReanalysisBatchId(null)
        }
    }

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Historial de Procesos
                    </CardTitle>
                    <CardDescription>
                        Últimas 10 sesiones de carga de facturas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="border rounded-lg p-4 animate-pulse">
                                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                                <div className="h-3 bg-muted rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Historial de Procesos
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                        <p>Error al cargar el historial de procesos</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Historial de Procesos
                    </CardTitle>
                    <CardDescription>
                        Últimas 10 sesiones de carga de facturas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {batches.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p>No hay procesos recientes</p>
                            <p className="text-sm">Los procesos aparecerán aquí después de cargar facturas</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {batches.map((batch) => (
                                <BatchHistoryItem
                                    key={batch.id}
                                    batch={batch}
                                    onViewErrors={handleViewErrors}
                                    onRetry={handleRetryBatch}
                                    isRetrying={retryingBatchId === batch.id}
                                    onCancel={handleCancelBatch}
                                    isCancelling={cancellingBatchId === batch.id}
                                    onReanalyze={handleReanalyzeBatch}
                                    isStartingReanalysis={startingReanalysisBatchId === batch.id}
                                    reanalysisJob={reanalysisJobMap.get(batch.id) ?? null}
                                    onViewReanalysisReport={handleViewReanalysisReport}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {errorsDialogOpen && selectedBatchData && (
                <BatchErrorsDialog
                    isOpen={errorsDialogOpen}
                    onClose={handleCloseErrorsDialog}
                    batchId={selectedBatchData.id}
                    errors={selectedBatchData.errors || []}
                    failedFiles={selectedBatchData.failedFiles || 0}
                    successfulFiles={selectedBatchData.successfulFiles || 0}
                    totalFiles={selectedBatchData.totalFiles || 0}
                />
            )}

            <BatchReanalysisDialog
                isOpen={reanalysisDialogOpen}
                onClose={handleCloseReanalysisDialog}
                batchId={reanalysisBatchId ?? ''}
                report={reanalysisReport}
                errorMessage={reanalysisError}
            />
        </>
    )
}
