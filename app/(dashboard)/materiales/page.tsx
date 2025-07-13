import { Suspense } from "react"
import { getMaterialAnalyticsPaginated, getMaterialFilterTotals } from "@/lib/actions/analytics"
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
  const sortBy = (getString("sortBy") as "quantity" | "cost" | "lastPurchase" | "name") || "quantity"
  const sortOrder = (getString("sortOrder") as "asc" | "desc") || "desc"
  const page = parseInt(getString("page") || '1', 10)
  const pageSize = 10 // Standard page size for better user experience

  const startDateStr = getString("startDate")
  const endDateStr = getString("endDate")

  const startDate = startDateStr ? new Date(startDateStr) : undefined
  const endDate = endDateStr ? new Date(endDateStr) : undefined

  const [materialData, suppliers, categories, workOrders, filterTotals] = await Promise.all([
    getMaterialAnalyticsPaginated({
      category: category && category !== "all" ? category : undefined,
      workOrder: workOrder && workOrder !== "all" ? workOrder : undefined,
      supplierId: supplierId && supplierId !== "all" ? supplierId : undefined,
      materialSearch: materialSearch || undefined,
      startDate,
      endDate,
      sortBy,
      sortOrder,
      page,
      pageSize,
    }),
    prisma.provider.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
      take: 1000 // Limit providers for filters dropdown to avoid performance issues
    }),
    prisma.material.findMany({
      select: { category: true },
      where: { category: { not: null } },
      distinct: ['category'],
      take: 100 // Limit categories to reasonable amount
    }).then(results => results.map(r => r.category!).filter(Boolean)),
    prisma.invoiceItem.findMany({
      select: { workOrder: true },
      where: { workOrder: { not: null } },
      distinct: ['workOrder'],
      take: 500 // Limit work orders for performance
    }).then(results => results.map(r => r.workOrder!).filter(Boolean)),
    getMaterialFilterTotals({
      category: category && category !== "all" ? category : undefined,
      workOrder: workOrder && workOrder !== "all" ? workOrder : undefined,
      supplierId: supplierId && supplierId !== "all" ? supplierId : undefined,
      materialSearch: materialSearch || undefined,
      startDate,
      endDate,
    })
  ])

  // Use filter totals for accurate summary stats across all filtered data, not just current page
  const totalCost = filterTotals.totalCost
  const totalQuantity = filterTotals.totalQuantity
  const totalSuppliers = filterTotals.supplierCount
  const avgUnitPrice = filterTotals.averageUnitPrice

  return {
    materialAnalytics: materialData.materials,
    suppliers,
    categories,
    workOrders,
    pagination: {
      currentPage: materialData.currentPage,
      totalPages: materialData.totalPages,
      pageSize: materialData.pageSize,
      totalCount: materialData.totalCount
    },
    stats: {
      totalCost,
      totalQuantity,
      totalSuppliers,
      avgUnitPrice,
      totalMaterials: materialData.totalCount // Use total count, not just current page
    },
    filterTotals
  }
}

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const resolvedSearchParams = await searchParams
  const data = await getMaterialsData(resolvedSearchParams)

  // Helper function to extract string values from search params
  const getString = (key: string) => {
    const value = resolvedSearchParams[key]
    return typeof value === "string" ? value : undefined
  }

  // Extract filters for Excel export
  const exportFilters = {
    materialSearch: getString('materialSearch'),
    category: getString('category') && getString('category') !== 'all' ? getString('category') : undefined,
    workOrder: getString('workOrder') && getString('workOrder') !== 'all' ? getString('workOrder') : undefined,
    supplierId: getString('supplierId') && getString('supplierId') !== 'all' ? getString('supplierId') : undefined,
    supplierCif: getString('supplierCif'),
    startDate: getString('startDate') ? new Date(getString('startDate')!) : undefined,
    endDate: getString('endDate') ? new Date(getString('endDate')!) : undefined,
    minUnitPrice: getString('minUnitPrice') ? parseFloat(getString('minUnitPrice')!) : undefined,
    maxUnitPrice: getString('maxUnitPrice') ? parseFloat(getString('maxUnitPrice')!) : undefined,
    minTotalCost: getString('minTotalCost') ? parseFloat(getString('minTotalCost')!) : undefined,
    maxTotalCost: getString('maxTotalCost') ? parseFloat(getString('maxTotalCost')!) : undefined,
    minQuantity: getString('minQuantity') ? parseFloat(getString('minQuantity')!) : undefined,
    maxQuantity: getString('maxQuantity') ? parseFloat(getString('maxQuantity')!) : undefined,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Materiales</h1>
          <p className="text-muted-foreground">
            Gestión y análisis de materiales ({data.stats.totalMaterials.toLocaleString()} materiales)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip
            title={helpContent.materiales.title}
            description={helpContent.materiales.description}
            content={helpContent.materiales.content}
          />
          <ExcelExportButton filters={{ ...exportFilters, exportType: 'materials-list' }} includeDetails />
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
          pagination={data.pagination}
          filterTotals={data.filterTotals}
        />
      </Suspense>
    </div>
  )
}
