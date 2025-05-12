import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { FileTextIcon, PrinterIcon, DownloadIcon, ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { invoiceDetail } from "@/lib/mock-data"

interface InvoiceDetailsProps {
  id: string
}

export function InvoiceDetails({ id }: InvoiceDetailsProps) {
  // En una implementación real, buscaríamos la factura por ID en la base de datos
  // Aquí usamos datos simulados
  const invoiceData = invoiceDetail

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/facturas">
          <Button variant="outline" className="gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a Facturas
          </Button>
        </Link>

        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <PrinterIcon className="h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline" className="gap-2">
            <DownloadIcon className="h-4 w-4" />
            Descargar PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Factura #{invoiceData.code}</CardTitle>
            <CardDescription>Fecha: {new Date(invoiceData.date).toLocaleDateString("es-ES")}</CardDescription>
          </div>
          <FileTextIcon className="h-8 w-8 text-muted-foreground" />
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Proveedor</h3>
              <div className="rounded-lg border p-3">
                <p className="font-medium">{invoiceData.supplierInfo.name}</p>
                <p className="text-sm">{invoiceData.supplierInfo.address}</p>
                <p className="text-sm">
                  {invoiceData.supplierInfo.city}, {invoiceData.supplierInfo.postalCode}
                </p>
                <p className="text-sm">Tel: {invoiceData.supplierInfo.phone}</p>
                <p className="text-sm">CIF: {invoiceData.supplierInfo.taxId}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Detalles de Factura</h3>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Código:</span>
                  <span className="font-medium">{invoiceData.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Fecha:</span>
                  <span>{new Date(invoiceData.date).toLocaleDateString("es-ES")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Estado:</span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Procesada
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Detalle de Materiales</h3>
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left text-sm font-medium">Material</th>
                    <th className="p-3 text-right text-sm font-medium">Cantidad</th>
                    <th className="p-3 text-right text-sm font-medium">Precio Unitario</th>
                    <th className="p-3 text-right text-sm font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3">{invoiceData.material}</td>
                    <td className="p-3 text-right">{invoiceData.quantity}</td>
                    <td className="p-3 text-right">{formatCurrency(invoiceData.amount / invoiceData.quantity)}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(invoiceData.amount)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={2} className="p-3"></td>
                    <td className="p-3 text-right font-medium">Subtotal</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(invoiceData.amount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="p-3"></td>
                    <td className="p-3 text-right font-medium">IVA (21%)</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(invoiceData.amount * 0.21)}</td>
                  </tr>
                  <tr className="bg-muted/50">
                    <td colSpan={2} className="p-3"></td>
                    <td className="p-3 text-right font-medium">Total</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(invoiceData.amount * 1.21)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Notas</h3>
            <div className="rounded-lg border p-3">
              <p className="text-sm">{invoiceData.notes}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
