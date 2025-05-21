import { InvoiceDetails } from "@/components/invoice-details"

interface InvoicePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Detalles de Factura</h1>
      <InvoiceDetails id={id} />
    </div>
  )
}
