"use client"

import { useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp, Copy, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface BatchErrorsDialogProps {
    isOpen: boolean
    onClose: () => void
    batchId: string
    errors?: string[]
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

    const successRate = totalFiles > 0 ? Math.round(((totalFiles - failedFiles) / totalFiles) * 100) : 0

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <div>
                            <DialogTitle>Errores de Procesamiento</DialogTitle>
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

                {errors.length > 0 ? (
                    <div className="flex-1 rounded-lg border overflow-y-auto">
                        <div className="p-4 space-y-2">
                            {errors.map((error, index) => (
                                <div
                                    key={index}
                                    className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                    <div
                                        className="flex items-center justify-between cursor-pointer"
                                        onClick={() => toggleError(index)}
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                                #{index + 1}
                                            </span>
                                            <p className="text-sm text-gray-700 truncate flex-1">
                                                {error}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    copyErrorToClipboard(error)
                                                }}
                                            >
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                            {expandedErrors.has(index) ? (
                                                <ChevronUp className="h-4 w-4 text-gray-500" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-gray-500" />
                                            )}
                                        </div>
                                    </div>

                                    {expandedErrors.has(index) && (
                                        <div className="mt-3 p-2 bg-white rounded border border-gray-200 text-xs font-mono text-gray-600 max-h-32 overflow-y-auto">
                                            {error}
                                        </div>
                                    )}
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

                <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        Cerrar
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            const errorText = errors.join("\n")
                            navigator.clipboard.writeText(errorText)
                            toast.success("Todos los errores copiados al portapapeles")
                        }}
                        className="flex-1"
                    >
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar todos
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
