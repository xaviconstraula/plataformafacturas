import { InvoiceDetailsClient } from "@/components/invoice-details-client"
import { updateInvoiceAction } from "@/lib/actions/invoices"

export interface InvoiceDetailsItem {
  id: string
  materialId: string
  quantity: number
  listPrice: number | null
  discountPercentage: number | null
  discountRaw?: string | null
  unitPrice: number
  totalPrice: number
  workOrder: string | null
  material: {
    id: string
    name: string
    code: string
    description: string | null
  }
}

export interface InvoiceDetailsData {
  id: string
  issueDate: Date
  status: string
  totalAmount: number
  ivaPercentage: number
  retentionAmount: number
  originalFileName?: string | null
  hasTotalsMismatch: boolean
  provider: {
    id: string
    name: string
    cif: string
    email: string | null
    phone: string | null
    address: string | null
  }
  items: InvoiceDetailsItem[]
}

interface InvoiceDetailsProps {
  invoice: InvoiceDetailsData
}

export function InvoiceDetails({ invoice }: InvoiceDetailsProps) {
  return <InvoiceDetailsClient invoice={invoice} updateInvoice={updateInvoiceAction} />
}
