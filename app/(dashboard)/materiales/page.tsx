import { Suspense } from "react"
import { getMaterialAnalytics } from "@/lib/actions/analytics"
import { NewMaterialButton } from "@/components/new-material-button"
import { ExcelExportButton } from "@/components/excel-export-button"
import { MaterialAnalyticsSection } from "@/components/material-analytics-section"
import { MaterialAnalyticsFilters } from "@/components/material-analytics-filters"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { prisma } from "@/lib/db"
import { DollarSign, Package, Users, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface MaterialsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function getMaterialsData(params: { [key: string]: string | string[] | undefined }) {
  // Extract and normalize filter parameters coming from the URL
  const getString = (key: string) => {
    const value = params[key]
    return typeof value === "string" ? value : undefined
  }

  const category = getString("category")
  const workOrder = getString("workOrder")
  const supplierId = getString("supplierId")
  const materialSearch = getString("materialSearch")
  const sortBy = (getString("sortBy") as "quantity" | "cost" | "lastPurchase" | "name") || "cost"
  const sortOrder = (getString("sortOrder") as "asc" | "desc") || "desc"

  const startDateStr = getString("startDate")
  const endDateStr = getString("endDate")

  const startDate = startDateStr ? new Date(startDateStr) : undefined
  const endDate = endDateStr ? new Date(endDateStr) : undefined

  const [materialAnalytics, suppliers, categories, workOrders] = await Promise.all([
    getMaterialAnalytics({
      category: category && category !== "all" ? category : undefined,
      workOrder: workOrder && workOrder !== "all" ? workOrder : undefined,
      supplierId: supplierId && supplierId !== "all" ? supplierId : undefined,
      materialSearch: materialSearch || undefined,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    }),
    prisma.provider.findMany({
      select: { id: true, name: true, type: true },
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

  // Calculate summary stats
  const totalCost = materialAnalytics.reduce((sum, material) => sum + material.totalCost, 0)
  const totalQuantity = materialAnalytics.reduce((sum, material) => sum + material.totalQuantity, 0)
  const totalSuppliers = [...new Set(materialAnalytics.flatMap(m => m.topSuppliers.map(s => s.supplierId)))].length
  const avgUnitPrice = totalCost / totalQuantity || 0

  return {
    materialAnalytics,
    suppliers,
    categories,
    workOrders,
    stats: {
      totalCost,
      totalQuantity,
      totalSuppliers,
      avgUnitPrice,
      totalMaterials: materialAnalytics.length
    }
  }
}

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const resolvedSearchParams = await searchParams
  const data = await getMaterialsData(resolvedSearchParams)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Materiales</h1>
          <p className="text-muted-foreground">
            Gestión y análisis de materiales
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip
            title={helpContent.materiales.title}
            description={helpContent.materiales.description}
            content={helpContent.materiales.content}
          />
          <ExcelExportButton />
          {/* <NewMaterialButton /> */}
        </div>
      </div>

      {/* Enhanced Filters */}
      <MaterialAnalyticsFilters
        suppliers={data.suppliers}
        categories={data.categories}
      />

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <MaterialAnalyticsSection
          materialAnalytics={data.materialAnalytics}
          suppliers={data.suppliers}
          categories={data.categories}
          workOrders={data.workOrders}
        />
      </Suspense>
    </div>
  )
}
