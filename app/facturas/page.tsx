import { Suspense } from "react"
import { InvoiceList } from "@/components/invoice-list"
import { InvoiceFilters } from "@/components/invoice-filters"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"

interface InvoicesPageProps {
  searchParams?: {
    month?: string
    quarter?: string
    year?: string
    supplier?: string
    search?: string
  }
}

export default function InvoicesPage({ searchParams }: InvoicesPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Facturas</h1>
        <Link href="/facturas/nueva">
          <Button>
            <PlusIcon className="mr-2 h-4 w-4" />
            Nueva Factura
          </Button>
        </Link>
      </div>

      <InvoiceFilters />

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <InvoiceList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
