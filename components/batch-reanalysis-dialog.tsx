"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, ExternalLinkIcon, ScanSearch } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { BatchReanalysisReport, FieldDiff, InvoiceComparisonResult, LineDiff } from "@/lib/invoice-extraction"
import { isMinorDiffField } from "@/lib/invoice-extraction"

interface BatchReanalysisDialogProps {
    isOpen: boolean
    onClose: () => void
    batchId: string
    report: BatchReanalysisReport | null
    errorMessage?: string | null
}

const fieldLabels: Record<string, string> = {
    invoiceCode: "Código factura",
    issueDate: "Fecha",
    totalAmount: "Importe total",
    ivaPercentage: "IVA %",
    retentionAmount: "Retención",
    "provider.cif": "CIF proveedor",
    "provider.name": "Nombre proveedor",
    lineCount: "Nº de líneas",
    lineNumber: "Número de línea",
    materialName: "Nombre del producto",
    lineNote: "Nota / detalle de línea",
    materialCode: "Código",
    quantity: "Cantidad",
    unitPrice: "Precio unitario",
    totalPrice: "Importe línea",
    workOrder: "Orden de trabajo",
    discountPercentage: "Descuento %",
    _missing: "Línea ausente en rescaneo",
    _extra: "Línea extra en rescaneo",
}

function getFieldLabel(field: string): string {
    return fieldLabels[field] ?? field
}

function getLineMatchBadge(line: LineDiff) {
    if (line.matchKind === 'missing') {
        return <Badge variant="outline" className="text-[10px]">Ausente en rescaneo</Badge>
    }
    if (line.matchKind === 'extra') {
        return <Badge variant="outline" className="text-[10px]">Extra en rescaneo</Badge>
    }
    if (line.matchKind === 'content') {
        return <Badge variant="secondary" className="text-[10px]">Emparejada por contenido</Badge>
    }
    return null
}

function getLinePositionLabel(line: LineDiff): string {
    const storedPosition = line.lineNumber ?? line.index + 1
    const rescannedPosition = line.rescannedLineNumber
        ?? (line.rescannedIndex !== undefined ? line.rescannedIndex + 1 : null)

    if (line.matchKind === 'missing') {
        return `Línea guardada #${storedPosition}`
    }
    if (line.matchKind === 'extra') {
        return `Línea rescaneada #${rescannedPosition ?? storedPosition}`
    }
    if (rescannedPosition !== null && storedPosition !== rescannedPosition) {
        return `Guardada #${storedPosition} ↔ Rescaneada #${rescannedPosition}`
    }
    return `Línea ${storedPosition}`
}

function isFieldMinorDiff(diff: FieldDiff): boolean {
    return diff.severity === 'minor' || isMinorDiffField(diff.field)
}

function filterInvoiceDiffs(
    invoice: InvoiceComparisonResult,
    hideMinorDiffs: boolean,
): InvoiceComparisonResult | null {
    if (!hideMinorDiffs) {
        return invoice
    }

    if (invoice.status === 'minor_diff') {
        return null
    }

    const invoiceLevelDiffs = invoice.invoiceLevelDiffs?.filter((diff) => !isFieldMinorDiff(diff))
    const lineDiffs = invoice.lineDiffs
        ?.map((line) => ({
            ...line,
            fields: line.fields.filter((field) => (
                field.field === '_missing'
                || field.field === '_extra'
                || !isFieldMinorDiff(field)
            )),
        }))
        .filter((line) => (
            line.matchKind === 'missing'
            || line.matchKind === 'extra'
            || line.fields.length > 0
        ))

    const hasVisibleDiffs = (invoiceLevelDiffs?.length ?? 0) > 0
        || (lineDiffs?.length ?? 0) > 0

    if (invoice.status === 'diff' && !hasVisibleDiffs) {
        return null
    }

    return {
        ...invoice,
        invoiceLevelDiffs: invoiceLevelDiffs && invoiceLevelDiffs.length > 0 ? invoiceLevelDiffs : undefined,
        lineDiffs: lineDiffs && lineDiffs.length > 0 ? lineDiffs : undefined,
    }
}

function FieldDiffRow({ diff }: { diff: FieldDiff }) {
    const isMinor = isFieldMinorDiff(diff)

    return (
        <div className={`rounded-lg border p-3 space-y-2 ${isMinor ? 'border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/20' : 'bg-muted/20'}`}>
            <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">{getFieldLabel(diff.field)}</p>
                {isMinor ? (
                    <Badge variant="outline" className="text-[10px] border-sky-300 text-sky-700 dark:text-sky-300">
                        Menor
                    </Badge>
                ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="mb-1">
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Guardado</Badge>
                    </div>
                    <p className="font-mono text-xs break-words">{diff.stored || '—'}</p>
                </div>
                <div className={`rounded-md border px-3 py-2 ${isMinor ? 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'}`}>
                    <div className="mb-1">
                        <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${isMinor ? 'border-sky-300 text-sky-800 dark:text-sky-300' : 'border-amber-300 text-amber-800 dark:text-amber-300'}`}>Rescaneado</Badge>
                    </div>
                    <p className="font-mono text-xs break-words">{diff.rescanned || '—'}</p>
                </div>
            </div>
        </div>
    )
}

const statusLabels = {
    match: { label: "Igual", variant: "default" as const },
    diff: { label: "Diferencias", variant: "destructive" as const },
    minor_diff: { label: "Diferencias menores", variant: "secondary" as const },
    not_found: { label: "No encontrada", variant: "secondary" as const },
    extraction_error: { label: "Error", variant: "outline" as const },
}

function InvoiceComparisonItem({ invoice }: { invoice: InvoiceComparisonResult }) {
    const [isExpanded, setIsExpanded] = useState(invoice.status === 'diff' || invoice.status === 'minor_diff')
    const status = statusLabels[invoice.status]

    const hasDetails = (invoice.status === 'diff' || invoice.status === 'minor_diff')
        && ((invoice.invoiceLevelDiffs?.length ?? 0) > 0 || (invoice.lineDiffs?.length ?? 0) > 0)

    return (
        <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{invoice.invoiceCode}</span>
                        <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{invoice.fileName}</p>
                    {invoice.error ? (
                        <p className="text-xs text-destructive">{invoice.error}</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {invoice.invoiceId ? (
                        <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                            <Link href={`/facturas/${invoice.invoiceId}`}>
                                Ver factura
                                <ExternalLinkIcon className="ml-1 h-3 w-3" />
                            </Link>
                        </Button>
                    ) : null}
                    {hasDetails ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded((prev) => !prev)}
                            className="h-7 w-7 p-0"
                            aria-label={isExpanded ? "Ocultar diferencias" : "Ver diferencias"}
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    ) : null}
                </div>
            </div>

            {isExpanded && hasDetails ? (
                <div className="space-y-3 border-t pt-3 text-xs">
                    {invoice.invoiceLevelDiffs && invoice.invoiceLevelDiffs.length > 0 ? (
                        <div className="space-y-2">
                            <p className="font-medium text-muted-foreground">Cabecera de factura</p>
                            {invoice.invoiceLevelDiffs.map((diff) => (
                                <FieldDiffRow key={`header-${diff.field}`} diff={diff} />
                            ))}
                        </div>
                    ) : null}

                    {invoice.lineDiffs && invoice.lineDiffs.length > 0 ? (
                        <div className="space-y-2">
                            <p className="font-medium text-muted-foreground">Líneas</p>
                            {invoice.lineDiffs.map((line) => (
                                <div key={`line-${line.index}-${line.lineNumber ?? 'na'}-${line.matchKind ?? 'default'}`} className="space-y-2 rounded-lg border p-3">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">{line.canonicalLineName ?? getLinePositionLabel(line)}</p>
                                            {getLineMatchBadge(line)}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">{getLinePositionLabel(line)}</p>
                                        {line.matchKind === 'missing' && line.storedLineLabel ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                Concepto guardado: {line.storedLineLabel}
                                            </p>
                                        ) : null}
                                        {line.matchKind === 'extra' && line.rescannedLineLabel ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                Concepto rescaneado: {line.rescannedLineLabel}
                                            </p>
                                        ) : null}
                                    </div>
                                    {line.fields
                                        .filter((field) => field.field !== '_missing' && field.field !== '_extra')
                                        .map((field) => (
                                            <FieldDiffRow key={`${line.index}-${field.field}`} diff={field} />
                                        ))}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

export function BatchReanalysisDialog({
    isOpen,
    onClose,
    batchId,
    report,
    errorMessage,
}: BatchReanalysisDialogProps) {
    const [hideMinorDiffs, setHideMinorDiffs] = useState(true)

    const visibleInvoices = report?.invoices
        .map((invoice) => filterInvoiceDiffs(invoice, hideMinorDiffs))
        .filter((invoice): invoice is InvoiceComparisonResult => invoice !== null) ?? []

    const hiddenCount = report
        ? report.invoices.length - visibleInvoices.length
        : 0

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-3xl max-h-[min(85vh,900px)] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ScanSearch className="h-5 w-5" />
                        Reanálisis de escaneo
                    </DialogTitle>
                    <DialogDescription>
                        Comparación entre los PDFs del lote y las facturas guardadas. No se modifican datos.
                    </DialogDescription>
                </DialogHeader>

                {errorMessage ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>{errorMessage}</p>
                    </div>
                ) : report ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <div className="rounded-lg border p-3 text-center">
                                <div className="flex items-center justify-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-lg font-semibold">{report.matchedCount}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Iguales</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                                <div className="flex items-center justify-center gap-1 text-orange-600">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-lg font-semibold">{report.diffCount}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Con diferencias</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                                <div className="flex items-center justify-center gap-1 text-sky-600">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-lg font-semibold">{report.minorDiffCount ?? 0}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Diferencias menores</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                                <span className="text-lg font-semibold">{report.notFoundCount}</span>
                                <p className="text-xs text-muted-foreground mt-1">Sin factura en BD</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                                <span className="text-lg font-semibold">{report.errorCount}</span>
                                <p className="text-xs text-muted-foreground mt-1">Errores de extracción</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={hideMinorDiffs}
                                    onChange={(event) => setHideMinorDiffs(event.target.checked)}
                                    className="h-4 w-4 rounded border-input accent-primary"
                                />
                                Ocultar diferencias menores
                            </label>
                            {hideMinorDiffs && hiddenCount > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    {hiddenCount} factura{hiddenCount !== 1 ? 's' : ''} oculta{hiddenCount !== 1 ? 's' : ''}
                                </p>
                            ) : null}
                        </div>

                        {visibleInvoices.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                {report.invoices.length === 0
                                    ? 'No hay resultados para mostrar.'
                                    : 'No hay diferencias relevantes con el filtro actual.'}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {visibleInvoices.map((invoice) => (
                                    <InvoiceComparisonItem
                                        key={`${invoice.r2Key}-${invoice.invoiceCode}`}
                                        invoice={invoice}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    )
}
