import { InvoiceDetails } from "@/components/invoices/invoice-details"

interface InvoicePageProps {
  params: {
    id: string
  }
}

export default function InvoicePage({ params }: InvoicePageProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Detalles de Factura</h1>
      <InvoiceDetails id={params.id} />
    </div>
  )
}
