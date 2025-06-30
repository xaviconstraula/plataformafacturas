import { Suspense } from "react"
import { getSupplierAnalytics } from "@/lib/actions/analytics"
import { NewSupplierButton } from "@/components/new-supplier-button"
import { ExcelExportButton } from "@/components/excel-export-button"
import { MergeProvidersDialog } from "@/components/merge-providers-dialog"
import { SupplierAnalyticsSection } from "@/components/supplier-analytics-section"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { prisma } from "@/lib/db"
import { DollarSign, Users, FileText, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

async function getSuppliersData() {
  const [supplierAnalytics, categories, workOrders] = await Promise.all([
    getSupplierAnalytics({ includeMonthlyBreakdown: true }),
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
  const totalSpent = supplierAnalytics.reduce((sum, supplier) => sum + supplier.totalSpent, 0)
  const totalInvoices = supplierAnalytics.reduce((sum, supplier) => sum + supplier.invoiceCount, 0)
  const totalMaterials = [...new Set(supplierAnalytics.flatMap(s => s.topMaterialsByCost.map(m => m.materialId)))].length
  const avgInvoiceAmount = totalSpent / totalInvoices || 0

  return {
    supplierAnalytics,
    categories,
    workOrders,
    stats: {
      totalSpent,
      totalInvoices,
      totalMaterials,
      avgInvoiceAmount,
      totalSuppliers: supplierAnalytics.length
    }
  }
}

export default async function SuppliersPage() {
  const data = await getSuppliersData()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Proveedores</h1>
          <p className="text-muted-foreground">
            Gestión y análisis de proveedores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip
            title={helpContent.proveedores.title}
            description={helpContent.proveedores.description}
            content={helpContent.proveedores.content}
          />
          <ExcelExportButton />
          <MergeProvidersDialog providers={data.supplierAnalytics.map(s => ({ id: s.supplierId, name: s.supplierName, cif: s.supplierCif }))} />
          <NewSupplierButton />
        </div>
      </div>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <SupplierAnalyticsSection
          supplierAnalytics={data.supplierAnalytics}
          categories={data.categories}
          workOrders={data.workOrders}
        />
      </Suspense>
    </div>
  )
}
