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
}

export function ExcelExportButton({
    filters = {},
    includeDetails = true,
    variant = 'outline',
    size = 'default',
    className,
    children
}: ExcelExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false)

    async function handleExport() {
        try {
            setIsExporting(true)
            toast.loading('Generando reporte Excel...', { id: 'excel-export' })

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...filters,
                    includeDetails
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

            toast.success('Reporte Excel descargado correctamente', { id: 'excel-export' })
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
                    {isExporting ? 'Exportando...' : 'Exportar Excel'}
                </span>
            ))}
        </Button>
    )
} 