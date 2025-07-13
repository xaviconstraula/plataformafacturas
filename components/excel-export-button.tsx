'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ExportFilters } from '@/lib/actions/export'

interface ExcelExportButtonProps {
    filters?: ExportFilters
    includeDetails?: boolean
    variant?: 'default' | 'outline' | 'secondary' | 'ghost'
    size?: 'default' | 'sm' | 'lg' | 'icon'
    className?: string
    children?: React.ReactNode
    exportType?: string
}

export function ExcelExportButton({
    filters = {},
    includeDetails = true,
    variant = 'outline',
    size = 'default',
    className,
    children,
    exportType
}: ExcelExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false)

    async function handleExport() {
        try {
            setIsExporting(true)

            // Show different loading message for work order exports
            const loadingMessage = filters?.workOrder
                ? `Generando reporte completo de OT ${filters.workOrder}...`
                : 'Generando reporte Excel...'

            toast.loading(loadingMessage, { id: 'excel-export' })

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...filters,
                    includeDetails,
                    ...(exportType !== undefined ? { exportType } : {})
                })
            })

            if (!response.ok) {
                throw new Error('Error al generar el reporte')
            }

            // Get the filename from the response headers
            const contentDisposition = response.headers.get('content-disposition')
            const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'reporte.xlsx'

            // Create blob and download
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)

            // Show different success message for work order exports
            const successMessage = filters?.workOrder
                ? `Reporte completo de OT ${filters.workOrder} descargado correctamente`
                : 'Reporte Excel descargado correctamente'

            toast.success(successMessage, { id: 'excel-export' })
        } catch (error) {
            console.error('Export error:', error)
            toast.error('Error al generar el reporte Excel', { id: 'excel-export' })
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <Button
            onClick={handleExport}
            disabled={isExporting}
            variant={variant}
            size={size}
            className={className}
        >
            {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Download className="h-4 w-4" />
            )}
            {children || (size !== 'icon' && (
                <span className="ml-2">
                    {isExporting
                        ? 'Exportando...'
                        : filters?.workOrder
                            ? 'Exportar Análisis Completo'
                            : 'Exportar Excel'
                    }
                </span>
            ))}
        </Button>
    )
} 