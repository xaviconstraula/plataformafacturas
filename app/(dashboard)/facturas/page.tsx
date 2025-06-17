import { Suspense } from "react"
import { InvoiceList } from "@/components/invoice-list"
import { InvoiceFilters } from "@/components/invoice-filters"
import { AdvancedInvoiceFilters } from "@/components/advanced-invoice-filters"
import { getInvoices } from "@/lib/actions/facturas"
import { NewInvoiceButton } from "@/components/new-invoice-button"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { exportInvoiceData } from "@/lib/actions/analytics"
import { prisma } from "@/lib/db"

interface InvoicesPageProps {
  searchParams: Promise<{
    month?: string
    quarter?: string
    year?: string
    fiscalYear?: string
    supplier?: string
    search?: string
    workOrder?: string
    material?: string
    minAmount?: string
    maxAmount?: string
    minUnitPrice?: string
    maxUnitPrice?: string
    category?: string
    page?: string
  }>
}

async function getFilterData() {
  const [suppliers, materials, categories, workOrders] = await Promise.all([
    prisma.provider.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' }
    }),
    prisma.material.findMany({
      select: { id: true, name: true, code: true, category: true },
      orderBy: { name: 'asc' }
    }),
    prisma.material.findMany({
      select: { category: true },
      where: { category: { not: null } },
      distinct: ['category']
    }).then(results => results.map(r => r.category!).filter(Boolean)),
    prisma.invoiceItem.findMany({
      select: { workOrder: true },
      where: { workOrder: { not: null } },
      distinct: ['workOrder']
    }).then(results => results.map(r => r.workOrder!).filter(Boolean))
  ])

  return {
    suppliers,
    materials: materials.map(m => ({ ...m, category: m.category || undefined })),
    categories,
    workOrders
  }
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const resolvedSearchParams = await searchParams;

  const page = parseInt(resolvedSearchParams.page || '1', 10)

  const [invoiceData, filterData] = await Promise.all([
    getInvoices({
      ...resolvedSearchParams,
      page,
      minAmount: resolvedSearchParams.minAmount ? parseFloat(resolvedSearchParams.minAmount) : undefined,
      maxAmount: resolvedSearchParams.maxAmount ? parseFloat(resolvedSearchParams.maxAmount) : undefined,
      minUnitPrice: resolvedSearchParams.minUnitPrice ? parseFloat(resolvedSearchParams.minUnitPrice) : undefined,
      maxUnitPrice: resolvedSearchParams.maxUnitPrice ? parseFloat(resolvedSearchParams.maxUnitPrice) : undefined,
    }),
    getFilterData()
  ])

  const { invoices, totalPages, currentPage, pageSize, totalCount } = invoiceData

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Facturas</h1>
        <div className="flex items-center gap-2">
          <HelpTooltip
            title={helpContent.facturas.title}
            description={helpContent.facturas.description}
            content={helpContent.facturas.content}
          />
          <NewInvoiceButton />
        </div>
      </div>

      <AdvancedInvoiceFilters
        suppliers={filterData.suppliers}
        materials={filterData.materials}
        categories={filterData.categories}
        workOrders={filterData.workOrders}
      />

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
