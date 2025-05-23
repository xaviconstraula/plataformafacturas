import { InvoiceDetails } from "@/components/invoice-details"
import { getInvoiceDetails } from "@/lib/actions/facturas"
import { notFound } from "next/navigation"

interface InvoicePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params

  try {
    const invoice = await getInvoiceDetails(id)

    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">Detalles de Factura</h1>
        <InvoiceDetails invoice={invoice} />
      </div>
    )
  } catch (error) {
    notFound()
  }
}
