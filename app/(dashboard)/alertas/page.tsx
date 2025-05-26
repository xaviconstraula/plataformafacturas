import { Suspense } from "react"
import { AlertList } from "@/components/alert-list"
import { getPriceAlerts } from "@/lib/actions/alertas"
import { Pagination } from "@/components/ui/pagination"

interface SearchParams {
  page?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AlertsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page) : 1
  const { alerts, total } = await getPriceAlerts(page, 20)
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Alertas de Precios</h1>
      <p className="text-muted-foreground">
        Variaciones significativas en los precios de materiales detectadas automáticamente.
      </p>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <AlertList initialAlerts={alerts} />
        <div className="mt-4">
          <Pagination totalPages={totalPages} />
        </div>
      </Suspense>
    </div>
  )
}
