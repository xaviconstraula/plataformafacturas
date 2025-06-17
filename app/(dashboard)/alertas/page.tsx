import { Suspense } from "react"
import { AlertList } from "@/components/alert-list"
import { getPriceAlerts } from "@/lib/actions/alertas"
import { Pagination } from "@/components/ui/pagination"
import { AlertStatusFilter } from "@/components/alert-status-filter"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"

interface SearchParams {
  page?: string
  status?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AlertsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page) : 1
  const status = params.status || "PENDING"
  const { alerts, total } = await getPriceAlerts(page, 20, status)
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alertas de Precios</h1>
          <p className="text-muted-foreground">
            Variaciones significativas en los precios de materiales detectadas automáticamente.
          </p>
        </div>
        <HelpTooltip
          title={helpContent.alertas.title}
          description={helpContent.alertas.description}
          content={helpContent.alertas.content}
        />
      </div>

      <div className="flex justify-end">
        <AlertStatusFilter />
      </div>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <AlertList initialAlerts={alerts} />
        <div className="mt-4">
          <Pagination totalPages={totalPages} />
        </div>
      </Suspense>
    </div>
  )
}
