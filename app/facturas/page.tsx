import { Suspense } from "react"
import { InvoiceList } from "@/components/invoice-list"
import { InvoiceFilters } from "@/components/invoice-filters"
import { getInvoices } from "@/lib/actions/facturas"
import { NewInvoiceButton } from "@/components/new-invoice-button"

interface InvoicesPageProps {
  searchParams: Promise<{
    month?: string
    quarter?: string
    year?: string
    supplier?: string
    search?: string
    page?: string
  }>
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const resolvedSearchParams = await searchParams;

  const page = parseInt(resolvedSearchParams.page || '1', 10)

  const { invoices, totalPages, currentPage, pageSize, totalCount } = await getInvoices({
    ...resolvedSearchParams,
    page,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Facturas</h1>
        <NewInvoiceButton />
      </div>

      <InvoiceFilters />

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <InvoiceList
          invoices={invoices}
          totalPages={totalPages}
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          searchParams={resolvedSearchParams}
        />
      </Suspense>
    </div>
  )
}
