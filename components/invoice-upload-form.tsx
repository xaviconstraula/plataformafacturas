"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { FileUploader } from "@/components/file-uploader"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { simulateCreateInvoice, simulatePdfExtraction } from "@/lib/mock-data"

const formSchema = z.object({
  supplier: z.string().min(2, {
    message: "El proveedor debe tener al menos 2 caracteres.",
  }),
  invoiceCode: z.string().min(1, {
    message: "El código de factura es obligatorio.",
  }),
  material: z.string().min(2, {
    message: "El material debe tener al menos 2 caracteres.",
  }),
  quantity: z.coerce.number().positive({
    message: "La cantidad debe ser un número positivo.",
  }),
  amount: z.coerce.number().positive({
    message: "El importe debe ser un número positivo.",
  }),
  date: z.string().min(1, {
    message: "La fecha es obligatoria.",
  }),
  notes: z.string().optional(),
})

export function InvoiceUploadForm() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("upload")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier: "",
      invoiceCode: "",
      material: "",
      quantity: undefined,
      amount: undefined,
      date: new Date().toISOString().split("T")[0],
      notes: "",
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      // Simulamos la creación de la factura
      await simulateCreateInvoice(values)

      toast.success("Factura creada", {
        description: "La factura ha sido creada exitosamente."
      })

      // Redirigir a la lista de facturas
      setTimeout(() => {
        router.push("/facturas")
      }, 1500)
    } catch (error: unknown) {
      console.error("Error al crear la factura:", error)
      toast.error("Error", {
        description: "Ocurrió un error al crear la factura."
      })
    }
  }

  async function handleFileUpload(file: File) {
    setIsUploading(true)
    setUploadProgress(0)

    // Simulamos el progreso de carga
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 10
      })
    }, 300)

    try {
      // Simulamos la extracción de datos del PDF
      const extractedData = await simulatePdfExtraction(file)

      // Cuando llegue al 100%, procesamos los datos
      setTimeout(() => {
        setIsUploading(false)

        form.setValue("supplier", extractedData.supplier)
        form.setValue("invoiceCode", extractedData.invoiceCode)
        form.setValue("material", extractedData.material)
        form.setValue("quantity", extractedData.quantity)
        form.setValue("amount", extractedData.amount)
        form.setValue("date", extractedData.date)

        setActiveTab("manual")

        toast.success("PDF procesado", {
          description: "Los datos han sido extraídos del PDF. Por favor, verifique y complete la información."
        })
      }, 1000)
    } catch (error: unknown) {
      console.error("Error al procesar el PDF:", error)
      setIsUploading(false)
      clearInterval(interval)

      toast.error("Error", {
        description: "Ocurrió un error al procesar el PDF."
      })
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="upload">Subir PDF</TabsTrigger>
        <TabsTrigger value="manual">Ingreso Manual</TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="mt-6">
        <Card>
          <CardContent className="pt-6">
            <FileUploader onFileUpload={handleFileUpload} isUploading={isUploading} progress={uploadProgress} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="manual" className="mt-6">
        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="supplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proveedor</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre del proveedor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="invoiceCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código de Factura</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. FAC-2025-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="material"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material</FormLabel>
                        <FormControl>
                          <Input placeholder="Tipo de material" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cantidad</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Importe</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <Button type="submit" className="w-full">
                  Guardar Factura
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
