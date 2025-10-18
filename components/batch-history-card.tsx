"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle, XCircle, Clock, FileText, ChevronDown, ChevronUp } from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import { BatchErrorsDialog } from "@/components/batch-errors-dialog"
import { getBatchHistory } from "@/lib/actions/invoices"
import { useQuery } from "@tanstack/react-query"
import type { BatchProgressInfo } from "@/lib/actions/invoices"

const statusConfig = {
    PENDING: { label: "Pendiente", icon: Clock, variant: "secondary" as const, color: "text-yellow-600" },
    PROCESSING: { label: "Procesando", icon: Clock, variant: "secondary" as const, color: "text-blue-600" },
    COMPLETED: { label: "Completado", icon: CheckCircle, variant: "default" as const, color: "text-green-600" },
    FAILED: { label: "Fallido", icon: XCircle, variant: "destructive" as const, color: "text-red-600" },
    CANCELLED: { label: "Cancelado", icon: XCircle, variant: "outline" as const, color: "text-gray-600" },
}

function BatchHistoryItem({
    batch,
    onViewErrors
}: {
    batch: BatchProgressInfo
    onViewErrors: (batch: BatchProgressInfo) => void
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const config = statusConfig[batch.status]
    const StatusIcon = config.icon

    // Count duplicates vs actual errors
    const duplicateCount = batch.errors?.filter(e => e.kind === 'DUPLICATE_INVOICE').length ?? 0
    const actualErrorCount = batch.errors?.filter(e => e.kind !== 'DUPLICATE_INVOICE').length ?? 0
    const hasErrors = actualErrorCount > 0 || (batch.failedFiles ?? 0) > 0
    const hasDuplicates = duplicateCount > 0

    return (
        <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* <StatusIcon className={`h-4 w-4 ${config.color}`} /> */}
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
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
                        </div>
                        <div className="text-xs text-muted-foreground mt-3">
                            {batch.totalFiles} archivos • {formatDateTime(batch.createdAt)}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasErrors && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewErrors(batch)}
                            className="text-xs"
                        >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Ver errores
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

export function BatchHistoryCard() {
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
    const [errorsDialogOpen, setErrorsDialogOpen] = useState(false)
    const [selectedBatchData, setSelectedBatchData] = useState<BatchProgressInfo | null>(null)

    const { data: batches = [], isLoading, error } = useQuery({
        queryKey: ['batch-history'],
        queryFn: async () => {
            return await getBatchHistory()
        },
        staleTime: 30 * 1000, // 30 seconds - refresh reasonably often
        gcTime: 5 * 60 * 1000, // 5 minutes
    })

    const handleViewErrors = (batch: BatchProgressInfo) => {
        setSelectedBatchData(batch)
        setErrorsDialogOpen(true)
    }

    const handleCloseErrorsDialog = () => {
        setErrorsDialogOpen(false)
        setSelectedBatchData(null)
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
                    totalFiles={selectedBatchData.totalFiles || 0}
                />
            )}
        </>
    )
}
