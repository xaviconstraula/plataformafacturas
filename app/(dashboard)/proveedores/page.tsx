import { Suspense } from "react"
import { getSupplierAnalyticsPaginated } from "@/lib/actions/analytics"
import { NewSupplierButton } from "@/components/new-supplier-button"
import { ExcelExportButton } from "@/components/excel-export-button"
import { MergeProvidersDialog } from "@/components/merge-providers-dialog"
import { SupplierAnalyticsSection } from "@/components/supplier-analytics-section"
import { HelpTooltip, helpContent } from "@/components/help-tooltip"
import { prisma } from "@/lib/db"
import { ProviderType } from "@/generated/prisma"
import { DollarSign, Users, FileText, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface SuppliersPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function getSuppliersData(params: { [key: string]: string | string[] | undefined }) {
  const getString = (key: string) => {
    const value = params[key]
    return typeof value === "string" ? value : undefined
  }

  const page = parseInt(getString("page") || '1', 10)
  const pageSize = 50 // Generous page size for performance
  const sortBy = (getString("sortBy") as "spent" | "invoices" | "materials" | "name") || "spent"
  const sortOrder = (getString("sortOrder") as "asc" | "desc") || "desc"

  // Parse filter parameters
  const supplierId = getString("supplierId") && getString("supplierId") !== "all" ? getString("supplierId") : undefined
  const supplierCif = getString("supplierCif")
  const supplierType = getString("supplierType") && getString("supplierType") !== "all" ? getString("supplierType") as ProviderType : undefined
  const workOrder = getString("workOrder")
  const materialCategory = getString("materialCategory") && getString("materialCategory") !== "all" ? getString("materialCategory") : undefined
  const startDate = getString("startDate") ? new Date(getString("startDate")!) : undefined
  const endDate = getString("endDate") ? new Date(getString("endDate")!) : undefined

  const [supplierData, categories, workOrders, allSuppliers] = await Promise.all([
    getSupplierAnalyticsPaginated({
      includeMonthlyBreakdown: true,
      page,
      pageSize,
      sortBy,
      sortOrder,
      supplierId,
      supplierCif,
      supplierType,
      workOrder,
      materialCategory,
      startDate,
      endDate
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
    // Get all suppliers for the dropdown
    prisma.provider.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 1000 // Limit for performance
    })
  ])

  // Calculate summary stats from current page data
  const totalSpent = supplierData.suppliers.reduce((sum, supplier) => sum + supplier.totalSpent, 0)
  const totalInvoices = supplierData.suppliers.reduce((sum, supplier) => sum + supplier.invoiceCount, 0)
  const totalMaterials = [...new Set(supplierData.suppliers.flatMap(s => s.topMaterialsByCost.map(m => m.materialId)))].length
  const avgInvoiceAmount = totalSpent / totalInvoices || 0

  return {
    supplierAnalytics: supplierData.suppliers,
    categories,
    workOrders,
    allSuppliers,
    pagination: {
      currentPage: supplierData.currentPage,
      totalPages: supplierData.totalPages,
      pageSize: supplierData.pageSize,
      totalCount: supplierData.totalCount
    },
    stats: {
      totalSpent,
      totalInvoices,
      totalMaterials,
      avgInvoiceAmount,
      totalSuppliers: supplierData.totalCount // Use total count, not just current page
    }
  }
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const resolvedSearchParams = await searchParams
  const data = await getSuppliersData(resolvedSearchParams)

  // Helper function to extract string values from search params
  const getString = (key: string) => {
    const value = resolvedSearchParams[key]
    return typeof value === "string" ? value : undefined
  }

  // Extract filters for Excel export
  const exportFilters = {
    supplierId: getString('supplierId') && getString('supplierId') !== 'all' ? getString('supplierId') : undefined,
    supplierCif: getString('supplierCif'),
    supplierType: getString('supplierType') && getString('supplierType') !== 'all' ? getString('supplierType') : undefined,
    workOrder: getString('workOrder'),
    materialCategory: getString('materialCategory') && getString('materialCategory') !== 'all' ? getString('materialCategory') : undefined,
    startDate: getString('startDate') ? new Date(getString('startDate')!) : undefined,
    endDate: getString('endDate') ? new Date(getString('endDate')!) : undefined,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Proveedores</h1>
          <p className="text-muted-foreground">
            Gestión y análisis de proveedores ({data.stats.totalSuppliers.toLocaleString()} proveedores)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip
            title={helpContent.proveedores.title}
            description={helpContent.proveedores.description}
            content={helpContent.proveedores.content}
          />
          <ExcelExportButton filters={{ ...exportFilters, exportType: 'suppliers-list' }} includeDetails />
          <MergeProvidersDialog providers={data.supplierAnalytics.map(s => ({ id: s.supplierId, name: s.supplierName, cif: s.supplierCif }))} />
          <NewSupplierButton />
        </div>
      </div>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <SupplierAnalyticsSection
          supplierAnalytics={data.supplierAnalytics}
          categories={data.categories}
          workOrders={data.workOrders}
          allSuppliers={data.allSuppliers}
          pagination={data.pagination}
        />
      </Suspense>
    </div>
  )
}
