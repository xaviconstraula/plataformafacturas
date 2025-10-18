"use client"

import { useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp, Copy, X, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatDateTime } from "@/lib/utils"

import type { BatchErrorDetail } from "@/lib/actions/invoices"

interface BatchErrorsDialogProps {
    isOpen: boolean
    onClose: () => void
    batchId: string
    errors?: BatchErrorDetail[]
    failedFiles: number
    totalFiles: number
}

export function BatchErrorsDialog({
    isOpen,
    onClose,
    batchId,
    errors = [],
    failedFiles,
    totalFiles,
}: BatchErrorsDialogProps) {
    const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())

    const toggleError = (index: number) => {
        const newExpanded = new Set(expandedErrors)
        if (newExpanded.has(index)) {
            newExpanded.delete(index)
        } else {
            newExpanded.add(index)
        }
        setExpandedErrors(newExpanded)
    }

    const copyErrorToClipboard = (error: string) => {
        navigator.clipboard.writeText(error)
        toast.success("Error copied to clipboard")
    }

    // Handle loading state when data is still being fetched
    const isLoadingData = totalFiles === 0 && failedFiles === 0 && errors.length === 0

    const successRate = totalFiles > 0 ? Math.round(((totalFiles - failedFiles) / totalFiles) * 100) : 0

    const duplicates = errors.filter(error => error.kind === 'DUPLICATE_INVOICE')
    const parsingErrors = errors.filter(error => error.kind === 'PARSING_ERROR' || error.kind === 'EXTRACTION_ERROR')
    const blockedProviders = errors.filter(error => error.kind === 'BLOCKED_PROVIDER')
    const otherErrors = errors.filter(error => !['DUPLICATE_INVOICE', 'PARSING_ERROR', 'EXTRACTION_ERROR', 'BLOCKED_PROVIDER'].includes(error.kind))

    const sections = [
        { title: 'Errores críticos', items: otherErrors, badgeVariant: 'destructive' as const },
        { title: 'Errores de lectura', items: parsingErrors, badgeVariant: 'secondary' as const },
        { title: 'Duplicadas', items: duplicates, badgeVariant: 'outline' as const },
        { title: 'Proveedores bloqueados', items: blockedProviders, badgeVariant: 'outline' as const },
    ].filter(section => section.items.length > 0)

    const areAllDuplicates = errors.length > 0 && duplicates.length === errors.length

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <div>
                            <DialogTitle>{areAllDuplicates ? 'Facturas Duplicadas' : 'Errores de Procesamiento'}</DialogTitle>
                            <DialogDescription>
                                Batch ID: {batchId}
                            </DialogDescription>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-8 w-8 p-0"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </DialogHeader>

                {isLoadingData ? (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                            <p className="text-gray-600">Cargando detalles del batch...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-4 pb-4 border-b">
                            <div className="bg-green-50 p-3 rounded-lg">
                                <p className="text-sm text-gray-600">Exitosos</p>
                                <p className="text-2xl font-bold text-green-600">
                                    {totalFiles - failedFiles}
                                </p>
                            </div>
                            <div className="bg-red-50 p-3 rounded-lg">
                                <p className="text-sm text-gray-600">Fallidos</p>
                                <p className="text-2xl font-bold text-red-600">{failedFiles}</p>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-lg">
                                <p className="text-sm text-gray-600">Tasa de éxito</p>
                                <p className="text-2xl font-bold text-blue-600">{successRate}%</p>
                            </div>
                        </div>

                        {sections.length > 0 ? (
                            <div className="flex-1 rounded-lg border overflow-y-auto">
                                <div className="p-4 space-y-6">
                                    {sections.map((section, sectionIndex) => (
                                        <div key={section.title}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <Badge variant={section.badgeVariant}>
                                                    {section.title.toUpperCase()} ({section.items.length})
                                                </Badge>
                                            </div>
                                            <div className="space-y-2">
                                                {section.items.map((error, index) => {
                                                    const globalIndex = sections
                                                        .slice(0, sectionIndex)
                                                        .reduce((acc, curr) => acc + curr.items.length, 0) + index

                                                    return (
                                                        <div
                                                            key={`${section.title}-${index}`}
                                                            className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                        >
                                                            <div
                                                                className="flex items-center justify-between cursor-pointer"
                                                                onClick={() => toggleError(globalIndex)}
                                                            >
                                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                    <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                                                        #{globalIndex + 1}
                                                                    </span>
                                                                    <div className="flex flex-col flex-1 min-w-0">
                                                                        <p className="text-sm font-medium text-gray-700 truncate">
                                                                            {error.message}
                                                                        </p>
                                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                                            {error.fileName ? (
                                                                                <span className="font-mono bg-white px-2 py-0.5 rounded border">
                                                                                    {error.fileName}
                                                                                </span>
                                                                            ) : null}
                                                                            {error.invoiceCode ? (
                                                                                <span className="font-mono bg-white px-2 py-0.5 rounded border border-dashed">
                                                                                    Factura: {error.invoiceCode}
                                                                                </span>
                                                                            ) : null}
                                                                            <span>
                                                                                {formatDateTime(error.timestamp)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            copyErrorToClipboard(error.message)
                                                                        }}
                                                                    >
                                                                        <Copy className="h-3 w-3" />
                                                                    </Button>
                                                                    {expandedErrors.has(globalIndex) ? (
                                                                        <ChevronUp className="h-4 w-4 text-gray-500" />
                                                                    ) : (
                                                                        <ChevronDown className="h-4 w-4 text-gray-500" />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {expandedErrors.has(globalIndex) && (
                                                                <div className="mt-3 space-y-2">
                                                                    <div className="p-2 bg-white rounded border border-gray-200 text-xs font-mono text-gray-600">
                                                                        {error.message}
                                                                    </div>
                                                                    {error.invoiceCode ? (
                                                                        <div className="text-xs text-gray-500">
                                                                            Código de factura: <span className="font-semibold">{error.invoiceCode}</span>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-center">
                                <div>
                                    <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">No se registraron errores detallados</p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        Cerrar
                    </Button>
                    {errors.length > 0 ? (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                const errorText = errors
                                    .map(error => `${error.fileName ?? 'Desconocido'} | ${error.invoiceCode ?? 'Sin código'} | ${error.message}`)
                                    .join("\n")
                                navigator.clipboard.writeText(errorText)
                                toast.success("Todos los errores copiados al portapapeles")
                            }}
                            className="flex-1"
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar todos
                        </Button>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}
