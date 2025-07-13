'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface AlertsExcelExportButtonProps {
    variant?: 'default' | 'outline' | 'secondary' | 'ghost'
    size?: 'default' | 'sm' | 'lg' | 'icon'
    className?: string
    children?: React.ReactNode
}

export function AlertsExcelExportButton({
    variant = 'outline',
    size = 'default',
    className,
    children
}: AlertsExcelExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false)
    const searchParams = useSearchParams()

    async function handleExport() {
        try {
            setIsExporting(true)

            // Get current filters from URL
            const status = searchParams.get('status') || undefined
            const startDate = searchParams.get('startDate') || undefined
            const endDate = searchParams.get('endDate') || undefined
            const materialId = searchParams.get('materialId') || undefined
            const providerId = searchParams.get('providerId') || undefined

            // Show a message indicating we're exporting ALL alerts
            const statusText = status && status !== 'ALL'
                ? ` con estado "${status === 'PENDING' ? 'Pendiente' : status === 'APPROVED' ? 'Aprobado' : 'Rechazado'}"`
                : ''
            toast.loading(`Exportando TODAS las alertas${statusText}...`, { id: 'alerts-export' })

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    exportType: 'alerts',
                    status: status === 'ALL' ? undefined : status,
                    startDate,
                    endDate,
                    materialId,
                    providerId
                })
            })

            if (!response.ok) {
                throw new Error('Error al generar el reporte')
            }

            // Get the filename from the response headers
            const contentDisposition = response.headers.get('content-disposition')
            const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'alertas_precios.xlsx'

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

            toast.success('Reporte completo de alertas descargado correctamente', { id: 'alerts-export' })
        } catch (error) {
            console.error('Export error:', error)
            toast.error('Error al generar el reporte de alertas', { id: 'alerts-export' })
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
                    {isExporting ? 'Exportando...' : 'Exportar Todas las Alertas'}
                </span>
            ))}
        </Button>
    )
}
