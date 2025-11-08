'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeftIcon, FileTextIcon, PencilIcon, SaveIcon, XIcon, AlertTriangle, PlusIcon, TrashIcon } from 'lucide-react'

import type { InvoiceDetailsData, InvoiceDetailsItem } from '@/components/invoice-details'
import type { UpdateInvoiceInput, UpdateInvoiceActionResult } from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface ItemDraft {
  id: string
  materialId: string
  materialName: string
  quantity: string
  listPrice: string
  discountPercentage: string
  discountRaw: string
  unitPrice: string
  totalPrice: string
  workOrder: string
}

function createDraft(items: InvoiceDetailsItem[]): ItemDraft[] {
  return items.map((item) => ({
    id: item.id,
    materialId: item.materialId,
    materialName: item.material.name,
    quantity: item.quantity.toString(),
    listPrice: item.listPrice !== null && item.listPrice !== undefined ? item.listPrice.toString() : '',
    discountPercentage: item.discountPercentage !== null && item.discountPercentage !== undefined ? item.discountPercentage.toString() : '',
    discountRaw: item.discountRaw ?? '',
    unitPrice: item.unitPrice.toString(),
    totalPrice: item.totalPrice.toString(),
    workOrder: item.workOrder ?? '',
  }))
}

function generateDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `draft-${Math.random().toString(36).slice(2, 11)}`
}

function createEmptyDraft(): ItemDraft {
  return {
    id: generateDraftId(),
    materialId: '',
    materialName: '',
    quantity: '',
    listPrice: '',
    discountPercentage: '',
    discountRaw: '',
    unitPrice: '',
    totalPrice: '',
    workOrder: '',
  }
}

interface InvoiceDetailsClientProps {
  invoice: InvoiceDetailsData
  updateInvoice: (payload: UpdateInvoiceInput) => Promise<UpdateInvoiceActionResult>
}

export function InvoiceDetailsClient({ invoice, updateInvoice }: InvoiceDetailsClientProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([])
  const isEditingRef = useRef(isEditing)

  const parseInputNumber = (value: string) => Number(value.replace(',', '.'))

  const [invoiceState, setInvoiceState] = useState<InvoiceDetailsData>(() => ({
    ...invoice,
    issueDate: new Date(invoice.issueDate),
  }))
  const invoiceItemsMap = useMemo(
    () => new Map(invoiceState.items.map((item) => [item.id, item])),
    [invoiceState.items],
  )
  const [draftItems, setDraftItems] = useState<ItemDraft[]>(() => createDraft(invoice.items))
  const [draftTotalAmount, setDraftTotalAmount] = useState<string>(invoice.totalAmount.toString())

  useEffect(() => {
    isEditingRef.current = isEditing
  }, [isEditing])

  useEffect(() => {
    if (isEditingRef.current) {
      return
    }
    setInvoiceState({
      ...invoice,
      issueDate: new Date(invoice.issueDate),
    })
    setDraftItems(createDraft(invoice.items))
    setDraftTotalAmount(invoice.totalAmount.toString())
    setDeletedItemIds([])
  }, [invoice])

  const invoiceLineItemsSum = useMemo(() => {
    return invoiceState.items.reduce((sum, item) => sum + item.totalPrice, 0)
  }, [invoiceState.items])

  const editingLineItemsSum = useMemo(() => {
    if (!isEditing) return invoiceLineItemsSum
    return draftItems.reduce((sum, item) => {
      const value = parseInputNumber(item.totalPrice)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
  }, [draftItems, invoiceLineItemsSum, isEditing])

  const lineItemsSum = isEditing ? editingLineItemsSum : invoiceLineItemsSum
  const invoiceTotal = isEditing ? parseInputNumber(draftTotalAmount) || 0 : invoiceState.totalAmount

  // Calculate expected total: base imponible + IVA - retention
  const expectedTotal = lineItemsSum + (lineItemsSum * invoiceState.ivaPercentage / 100) - invoiceState.retentionAmount
  const totalDifference = Math.abs(expectedTotal - invoiceTotal)

  const mismatchDetected = isEditing
    ? totalDifference > 0.5
    : invoiceState.hasTotalsMismatch

  const handleEnterEditMode = () => {
    setDraftItems(createDraft(invoiceState.items))
    setDraftTotalAmount(invoiceState.totalAmount.toString())
    setFormErrors([])
    setDeletedItemIds([])
    setIsEditing(true)
  }

  const handleCancel = () => {
    setDraftItems(createDraft(invoiceState.items))
    setDraftTotalAmount(invoiceState.totalAmount.toString())
    setFormErrors([])
    setDeletedItemIds([])
    setIsEditing(false)
  }

  const updateDraftItem = (itemId: string, key: keyof ItemDraft, value: string) => {
    setDraftItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [key]: value } : item)))
  }

  const handleAddLine = () => {
    setDraftItems((prev) => [...prev, createEmptyDraft()])
  }

  const handleRemoveLine = (itemId: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== itemId))

    if (invoiceItemsMap.has(itemId)) {
      setDeletedItemIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]))
    }
  }

  const handleSave = () => {
    if (isPending) return

    const clientErrors: string[] = []

    if (draftItems.length === 0) {
      clientErrors.push('La factura debe contener al menos una línea.')
    }

    draftItems.forEach((item, index) => {
      if (!item.materialName.trim()) {
        clientErrors.push(`La línea ${index + 1} debe tener un nombre de material.`)
      }

      if (item.quantity.trim() === '' || !Number.isFinite(parseInputNumber(item.quantity))) {
        clientErrors.push(`La cantidad de la línea ${index + 1} no es válida.`)
      }

      if (item.unitPrice.trim() === '' || !Number.isFinite(parseInputNumber(item.unitPrice))) {
        clientErrors.push(`El precio unitario de la línea ${index + 1} no es válido.`)
      }

      if (item.totalPrice.trim() === '' || !Number.isFinite(parseInputNumber(item.totalPrice))) {
        clientErrors.push(`El total de la línea ${index + 1} no es válido.`)
      }
    })

    if (draftTotalAmount.trim() === '' || !Number.isFinite(parseInputNumber(draftTotalAmount))) {
      clientErrors.push('El total de la factura no es válido.')
    }

    if (clientErrors.length > 0) {
      setFormErrors(clientErrors)
      return
    }

    const payload: UpdateInvoiceInput = {
      invoiceId: invoiceState.id,
      totalAmount: parseInputNumber(draftTotalAmount),
      items: draftItems.map((item) => ({
        id: item.id,
        materialId: item.materialId.trim() === '' ? null : item.materialId.trim(),
        materialName: item.materialName.trim(),
        quantity: parseInputNumber(item.quantity),
        listPrice: item.listPrice.trim() === '' ? null : parseInputNumber(item.listPrice),
        discountPercentage: item.discountPercentage.trim() === '' ? null : parseInputNumber(item.discountPercentage),
        discountRaw: item.discountRaw.trim() === '' ? null : item.discountRaw.trim(),
        unitPrice: parseInputNumber(item.unitPrice),
        totalPrice: parseInputNumber(item.totalPrice),
        workOrder: item.workOrder.trim() === '' ? null : item.workOrder.trim(),
      })),
      deletedItemIds,
    }

    setFormErrors([])

    startTransition(async () => {
      try {
        const result = await updateInvoice(payload)

        if (!result.success) {
          setFormErrors(result.errors ?? [result.message])
          toast.error('No se pudo actualizar la factura', {
            description: result.message,
          })
          return
        }

        setInvoiceState((prev) => {
          const map = new Map(prev.items.map((item) => [item.id, item]))
          const updatedItems = payload.items.map((updated) => {
            const itemId = updated.id ?? generateDraftId()
            const existing = map.get(itemId)

            if (!existing) {
              const materialId = updated.materialId ?? itemId
              return {
                id: itemId,
                materialId,
                quantity: updated.quantity,
                listPrice: updated.listPrice ?? null,
                discountPercentage: updated.discountPercentage ?? null,
                discountRaw: updated.discountRaw ?? null,
                unitPrice: updated.unitPrice,
                totalPrice: updated.totalPrice,
                workOrder: updated.workOrder ?? null,
                material: {
                  id: materialId,
                  name: updated.materialName,
                  code: '',
                  description: null,
                },
              }
            }

            return {
              ...existing,
              quantity: updated.quantity,
              listPrice: updated.listPrice ?? null,
              discountPercentage: updated.discountPercentage ?? null,
              discountRaw: updated.discountRaw ?? existing.discountRaw ?? null,
              unitPrice: updated.unitPrice,
              totalPrice: updated.totalPrice,
              workOrder: updated.workOrder ?? null,
              material: {
                ...existing.material,
                name: updated.materialName,
              },
            }
          })

          return {
            ...prev,
            totalAmount: payload.totalAmount,
            hasTotalsMismatch: result.hasTotalsMismatch,
            items: updatedItems,
          }
        })

        setDeletedItemIds([])
        setIsEditing(false)
        toast.success('Factura actualizada correctamente')
        router.refresh()
      } catch (error) {
        console.error('[InvoiceDetailsClient] Failed to update invoice', error)
        toast.error('Error inesperado al actualizar la factura')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/facturas">
          <Button variant="outline" className="gap-2" disabled={isPending}>
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a Facturas
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {invoiceState.hasTotalsMismatch && !isEditing ? (
            <Badge variant="destructive" className="uppercase tracking-wide">Descuadre</Badge>
          ) : null}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
                className="gap-1"
              >
                <XIcon className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isPending}
                className="gap-1"
              >
                <SaveIcon className="h-4 w-4" />
                Guardar cambios
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleEnterEditMode} className="gap-1">
              <PencilIcon className="h-4 w-4" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {invoiceState.hasTotalsMismatch && !isEditing ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>
              El total de la factura no coincide con la suma de las líneas. Revisa los importes y corrige los valores para eliminar
              este aviso.
            </span>
          </div>
        </div>
      ) : null}

      {formErrors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium mb-1">Corrige los siguientes errores:</p>
          <ul className="list-disc space-y-1 pl-5">
            {formErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Detalles de Factura</CardTitle>
            <CardDescription>
              Fecha: {invoiceState.issueDate.toLocaleDateString('es-ES')}
            </CardDescription>
          </div>
          <FileTextIcon className="h-8 w-8 text-muted-foreground" />
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Proveedor</h3>
              <div className="rounded-lg border p-3">
                <p className="font-medium">{invoiceState.provider.name}</p>
                {invoiceState.provider.address && <p className="text-sm">{invoiceState.provider.address}</p>}
                {invoiceState.provider.phone && <p className="text-sm">Tel: {invoiceState.provider.phone}</p>}
                <p className="text-sm">CIF: {invoiceState.provider.cif}</p>
                {invoiceState.provider.email && <p className="text-sm">Email: {invoiceState.provider.email}</p>}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Detalles de Factura</h3>
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Fecha:</span>
                  <span>{invoiceState.issueDate.toLocaleDateString('es-ES')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Estado:</span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    {invoiceState.status}
                  </span>
                </div>
                {invoiceState.originalFileName ? (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Archivo:</span>
                    <span className="text-sm font-mono">{invoiceState.originalFileName}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Detalle de Materiales</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b bg-muted/50 text-sm">
                    <th className="p-3 text-left font-medium">Material</th>
                    <th className="p-3 text-left font-medium">OT/CECO</th>
                    <th className="p-3 text-right font-medium">Cantidad</th>
                    <th className="p-3 text-right font-medium">Precio Base</th>
                    <th className="p-3 text-right font-medium">% Dto.</th>
                    <th className="p-3 text-right font-medium">Total</th>
                    {isEditing ? <th className="w-14 p-3 text-right font-medium">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {isEditing
                    ? draftItems.map((draft) => {
                        const original = invoiceItemsMap.get(draft.id)

                        return (
                          <tr key={draft.id} className="border-b last:border-0">
                            <td className="p-3 align-top">
                              <div className="space-y-1.5">
                                <Input
                                  value={draft.materialName}
                                  onChange={(event) => updateDraftItem(draft.id, 'materialName', event.target.value)}
                                  placeholder="Nombre del material"
                                  disabled={isPending}
                                />
                                {original?.material.code ? (
                                  <p className="text-xs text-muted-foreground">Código: {original.material.code}</p>
                                ) : null}
                              </div>
                            </td>
                            <td className="p-3 align-top font-mono text-xs">
                              <Input
                                value={draft.workOrder}
                                onChange={(event) => updateDraftItem(draft.id, 'workOrder', event.target.value)}
                                placeholder="OT/CECO"
                                disabled={isPending}
                              />
                            </td>
                            <td className="p-3 align-top text-right">
                              <Input
                                value={draft.quantity}
                                onChange={(event) => updateDraftItem(draft.id, 'quantity', event.target.value)}
                                type="number"
                                inputMode="decimal"
                                step="0.001"
                                disabled={isPending}
                                className="text-right"
                              />
                            </td>
                            <td className="p-3 align-top text-right">
                              <Input
                                value={draft.unitPrice}
                                onChange={(event) => updateDraftItem(draft.id, 'unitPrice', event.target.value)}
                                type="number"
                                inputMode="decimal"
                                step="0.001"
                                placeholder="Ej. 15.75"
                                disabled={isPending}
                                className="text-right"
                              />
                            </td>
                            <td className="p-3 align-top text-right">
                              <Input
                                value={draft.discountPercentage}
                                onChange={(event) => updateDraftItem(draft.id, 'discountPercentage', event.target.value)}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                placeholder="%"
                                disabled={isPending}
                                className="text-right"
                              />
                            </td>
                            <td className="p-3 align-top text-right font-medium">
                              <Input
                                value={draft.totalPrice}
                                onChange={(event) => updateDraftItem(draft.id, 'totalPrice', event.target.value)}
                                type="number"
                                inputMode="decimal"
                                step="0.001"
                                disabled={isPending}
                                className="text-right"
                              />
                            </td>
                            <td className="p-3 align-top text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveLine(draft.id)}
                                disabled={isPending}
                                aria-label="Eliminar línea"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    : invoiceState.items.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="p-3 align-top">
                            <div className="space-y-0.5">
                              <p className="font-medium">{item.material.name}</p>
                              {item.material.code ? (
                                <p className="text-xs text-muted-foreground">Código: {item.material.code}</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="p-3 align-top font-mono text-xs">{item.workOrder || '-'}</td>
                          <td className="p-3 align-top text-right">{item.quantity}</td>
                          <td className="p-3 align-top text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="p-3 align-top text-right">
                            {item.discountPercentage !== null && item.discountPercentage !== undefined
                              ? `${item.discountPercentage.toFixed(2)}%`
                              : '0.00%'}
                          </td>
                          <td className="p-3 align-top text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {isEditing ? (
                <div className="flex justify-end border-t bg-muted/30 p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddLine}
                    disabled={isPending}
                    className="gap-1"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Añadir línea
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Desglose de Factura</h3>
              {isEditing ? (
                <span className="text-xs text-muted-foreground">
                  Ajusta los valores para que coincidan con el total de la factura.
                </span>
              ) : null}
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex justify-between">
                <span className="text-sm">Suma de líneas (con IVA):</span>
                <span className="font-medium">{formatCurrency(expectedTotal)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Total Factura:</span>
                {isEditing ? (
                  <Input
                    value={draftTotalAmount}
                    onChange={(event) => setDraftTotalAmount(event.target.value)}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    disabled={isPending}
                    className="w-40 text-right"
                  />
                ) : (
                  <span>{formatCurrency(invoiceState.totalAmount)}</span>
                )}
              </div>
              {Math.abs(totalDifference) > 0.01 ? (
                <div className="flex justify-between text-sm font-medium text-red-600">
                  <span>Diferencia:</span>
                  <span>{formatCurrency(totalDifference)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {isEditing && mismatchDetected ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  La suma de las líneas todavía no coincide con el total de la factura. Ajusta los importes antes de guardar si deseas eliminar el
                  aviso.
                </span>
              </div>
            </div>
          ) : null}

          {isEditing ? (
            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isPending}
                className="gap-1"
              >
                <XIcon className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="gap-1"
              >
                <SaveIcon className="h-4 w-4" />
                Guardar cambios
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}


