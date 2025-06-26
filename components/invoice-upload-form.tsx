"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useFieldArray } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InvoiceDropzone } from "@/components/invoice-dropzone"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Trash2, Plus } from "lucide-react"
import { createManualInvoice, type CreateInvoiceResult } from "@/lib/actions/invoices"

interface InvoiceUploadFormProps {
  onClose?: () => void; // Optional callback to close parent modal
}

// Enhanced schema that matches the real database structure
const invoiceItemSchema = z.object({
  materialName: z.string().min(2, {
    message: "El material debe tener al menos 2 caracteres.",
  }),
  quantity: z.coerce.number().positive({
    message: "La cantidad debe ser un número positivo.",
  }),
  unitPrice: z.coerce.number().positive({
    message: "El precio unitario debe ser un número positivo.",
  }),
  description: z.string().optional(),
  workOrder: z.string().optional(),
})

const formSchema = z.object({
  // Provider information
  providerName: z.string().min(2, {
    message: "El proveedor debe tener al menos 2 caracteres.",
  }),
  providerCif: z.string().min(1, {
    message: "El CIF es obligatorio para unificar proveedores.",
  }),
  providerEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  providerPhone: z.string().optional(),

  // Invoice details
  invoiceCode: z.string().min(1, {
    message: "El código de factura es obligatorio.",
  }),
  issueDate: z.string().min(1, {
    message: "La fecha es obligatoria.",
  }),

  // Items
  items: z.array(invoiceItemSchema).min(1, {
    message: "Debe agregar al menos un item a la factura.",
  }),

  // Notes
  notes: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export function InvoiceUploadForm({ onClose }: InvoiceUploadFormProps = {}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("upload")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      providerName: "",
      providerCif: "",
      providerEmail: "",
      providerPhone: "",
      invoiceCode: "",
      issueDate: new Date().toISOString().split("T")[0],
      items: [
        {
          materialName: "",
          quantity: 0,
          unitPrice: 0,
          description: "",
          workOrder: "",
        }
      ],
      notes: "",
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  async function onSubmit(values: FormData) {
    setIsSubmitting(true)
    try {
      // Transform the form data to match the expected API format
      const invoiceData = {
        provider: {
          name: values.providerName,
          cif: values.providerCif,
          email: values.providerEmail || null,
          phone: values.providerPhone || null,
        },
        invoiceCode: values.invoiceCode,
        issueDate: values.issueDate,
        items: values.items.map(item => ({
          materialName: item.materialName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
          description: item.description || null,
          workOrder: item.workOrder || null,
          isMaterial: true, // Assume manual entries are materials
        })),
        totalAmount: values.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
      }

      const result = await createManualInvoice(invoiceData)

      if (result.success) {
        toast.success("Factura creada", {
          description: result.message
        })

        // Clear form and close modal if available
        form.reset()

        // Close modal immediately if we have a callback
        if (onClose) {
          onClose();
        }

        // Also emit a custom event to close any modal that might be open
        const closeModalEvent = new CustomEvent('closeInvoiceModal');
        window.dispatchEvent(closeModalEvent);

        setTimeout(() => {
          router.push("/facturas")
        }, 1500)
      } else {
        if (result.isBlockedProvider) {
          // Emit custom event for blocked provider
          const providerNameMatch = result.message.match(/Provider '(.+?)' is blocked/);
          const providerName = providerNameMatch ? providerNameMatch[1] : invoiceData.provider.name;

          const event = new CustomEvent('blockedProvider', {
            detail: {
              providerName,
              fileName: 'Manual Entry'
            }
          });
          window.dispatchEvent(event);
        } else {
          toast.error("Error", {
            description: result.message
          })
        }
      }
    } catch (error: unknown) {
      console.error("Error al crear la factura:", error)
      toast.error("Error", {
        description: "Ocurrió un error inesperado al crear la factura."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handlePdfProcessingComplete(results: CreateInvoiceResult[]) {
    // Handle blocked providers - events are already emitted by InvoiceDropzone

    // Show results and redirect
    const successfulUploads = results.filter(r => r.success && !r.message.includes("already exists")).length;
    const blockedProviders = results.filter(r => r.isBlockedProvider).length;
    const batchId = results.length > 0 ? results[0].batchId : undefined;

    // Close modal immediately if we have a callback
    if (onClose) {
      onClose();
    }

    // Also emit a custom event to close any modal that might be open
    const closeModalEvent = new CustomEvent('closeInvoiceModal');
    window.dispatchEvent(closeModalEvent);

    if (batchId) {
      // If we have a batch ID, processing has started - let BatchProgressBanner handle the reload
      toast.success("Procesamiento iniciado", {
        description: `Las facturas están siendo procesadas. La página se actualizará automáticamente cuando esté listo.`
      });
    } else if (successfulUploads > 0) {
      // Direct processing without batch - reload immediately
      toast.success(`Facturas procesadas exitosamente: ${successfulUploads}`);
      setTimeout(() => {
        window.location.reload();
      }, 1000)
    } else if (blockedProviders > 0 && successfulUploads === 0) {
      // If only blocked providers and no successful uploads, show info
      toast.info("Procesamiento completado", {
        description: `${blockedProviders} archivo(s) con proveedores bloqueados`
      })

      // Still reload to invoices page
      setTimeout(() => {
        window.location.reload();
      }, 1000)
    }
  }

  function addItem() {
    append({
      materialName: "",
      quantity: 0,
      unitPrice: 0,
      description: "",
      workOrder: "",
    })
  }

  function removeItem(index: number) {
    if (fields.length > 1) {
      remove(index)
    }
  }

  // Calculate total amount
  const watchedItems = form.watch("items")
  const totalAmount = watchedItems.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    return sum + (quantity * unitPrice)
  }, 0)

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="upload">Subir PDF</TabsTrigger>
        <TabsTrigger value="manual">Ingreso Manual</TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="mt-6">
        <Card>
          <CardContent className="pt-6">
            <InvoiceDropzone onProcessingComplete={handlePdfProcessingComplete} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="manual" className="mt-6">
        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* Provider Information */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Información del Proveedor</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="providerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre del Proveedor *</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre del proveedor" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="providerCif"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CIF/NIF *</FormLabel>
                          <FormControl>
                            <Input placeholder="B12345678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="providerEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="contacto@proveedor.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="providerPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono</FormLabel>
                          <FormControl>
                            <Input placeholder="+34 900 000 000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Invoice Information */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Información de la Factura</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="invoiceCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código de Factura *</FormLabel>
                          <FormControl>
                            <Input placeholder="FAC-2025-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="issueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de Emisión *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Invoice Items */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Items de la Factura</h3>
                    <Button type="button" variant="outline" onClick={addItem}>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Item
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <Card key={field.id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">Item {index + 1}</h4>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          <FormField
                            control={form.control}
                            name={`items.${index}.materialName`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Material *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Nombre del material" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Cantidad *</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" placeholder="0" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`items.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Precio Unitario *</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`items.${index}.workOrder`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>OT/CECO</FormLabel>
                                <FormControl>
                                  <Input placeholder="OT-12345" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="md:col-span-2">
                            <FormField
                              control={form.control}
                              name={`items.${index}.description`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Descripción</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Descripción adicional del item" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div className="mt-3 p-2 bg-muted rounded text-sm">
                          Total del item: €{((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.unitPrice || 0)).toFixed(2)}
                        </div>
                      </Card>
                    ))}
                  </div>

                  <div className="mt-4 p-4 bg-primary/5 rounded-lg">
                    <div className="text-lg font-semibold">
                      Total de la Factura: €{totalAmount.toFixed(2)}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionales sobre la factura" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : "Guardar Factura"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
