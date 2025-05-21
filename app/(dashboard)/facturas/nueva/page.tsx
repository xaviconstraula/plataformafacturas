import { InvoiceUploadForm } from "@/components/invoice-upload-form"

export default function NewInvoicePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Nueva Factura</h1>
      <p className="text-muted-foreground">
        Sube un archivo PDF de factura para extraer automáticamente la información o ingresa los datos manualmente.
      </p>

      <InvoiceUploadForm />
    </div>
  )
}
