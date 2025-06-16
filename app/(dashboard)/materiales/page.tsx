import { Suspense } from "react"
import { getMaterialAnalytics } from "@/lib/actions/analytics"
import { NewMaterialButton } from "@/components/new-material-button"
import { ExcelExportButton } from "@/components/excel-export-button"
import { MaterialAnalyticsSection } from "@/components/material-analytics-section"
import { MaterialAnalyticsFilters } from "@/components/material-analytics-filters"
import { prisma } from "@/lib/db"
import { DollarSign, Package, Users, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

async function getMaterialsData() {
  const [materialAnalytics, suppliers, categories, workOrders] = await Promise.all([
    getMaterialAnalytics({ sortBy: 'cost', sortOrder: 'desc' }),
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

export default async function MaterialsPage() {
  const data = await getMaterialsData()

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
