import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { FileTextIcon, PrinterIcon, DownloadIcon, ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

interface InvoiceItem {
  id: string
  quantity: number
  listPrice?: number | null
  discountPercentage?: number | null
  unitPrice: number
  totalPrice: number
  workOrder?: string | null
  material: {
    id: string
    name: string
    code: string
    description: string | null
  }
}

interface InvoiceData {
  id: string
  issueDate: Date
  status: string
  totalAmount: number
  provider: {
    id: string
    name: string
    cif: string
    email: string | null
    phone: string | null
    address: string | null
  }
  items: InvoiceItem[]
}

interface InvoiceDetailsProps {
  invoice: InvoiceData
}

export function InvoiceDetails({ invoice }: InvoiceDetailsProps) {
  // Calculate totals
  const subtotal = invoice.items.reduce((sum, item) => sum + item.totalPrice, 0)
  const ivaAmount = subtotal * 0.21 // 21% IVA
  const totalWithIva = subtotal + ivaAmount

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/facturas">
          <Button variant="outline" className="gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a Facturas
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Detalles de Factura</CardTitle>
            <CardDescription>Fecha: {invoice.issueDate.toLocaleDateString("es-ES")}</CardDescription>
          </div>
          <FileTextIcon className="h-8 w-8 text-muted-foreground" />
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Proveedor</h3>
              <div className="rounded-lg border p-3">
                <p className="font-medium">{invoice.provider.name}</p>
                {invoice.provider.address && <p className="text-sm">{invoice.provider.address}</p>}
                {invoice.provider.phone && <p className="text-sm">Tel: {invoice.provider.phone}</p>}
                <p className="text-sm">CIF: {invoice.provider.cif}</p>
                {invoice.provider.email && <p className="text-sm">Email: {invoice.provider.email}</p>}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Detalles de Factura</h3>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Fecha:</span>
                  <span>{invoice.issueDate.toLocaleDateString("es-ES")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Estado:</span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    {invoice.status}
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
                    <th className="p-3 text-left text-sm font-medium">OT/CECO</th>
                    <th className="p-3 text-right text-sm font-medium">Cantidad</th>
                    <th className="p-3 text-right text-sm font-medium">Precio Base</th>
                    <th className="p-3 text-right text-sm font-medium">% Dto.</th>
                    <th className="p-3 text-right text-sm font-medium">Precio Final</th>
                    <th className="p-3 text-right text-sm font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{item.material.name}</p>
                        </div>
                      </td>
                      <td className="p-3 text-left font-mono text-xs">{item.workOrder || '-'}</td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      <td className="p-3 text-right">{formatCurrency(item.listPrice ?? item.unitPrice)}</td>
                      <td className="p-3 text-right">{item.discountPercentage !== undefined && item.discountPercentage !== null ? `${item.discountPercentage.toFixed(2)}%` : '0.00%'}</td>
                      <td className="p-3 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* IVA Breakdown */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Desglose de Factura</h3>
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Base Imponible:</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">IVA (21%):</span>
                <span className="font-medium">{formatCurrency(ivaAmount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total con IVA:</span>
                <span>{formatCurrency(totalWithIva)}</span>
              </div>
              {/* Show actual invoice total if different (for verification) */}
              {Math.abs(totalWithIva - invoice.totalAmount) > 0.01 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Total Factura:</span>
                  <span>{formatCurrency(invoice.totalAmount)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
