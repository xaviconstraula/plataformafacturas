import { Suspense } from "react"
import { getSupplierAnalyticsPaginated, getWorkOrdersForSuppliers, getMaterialsForSuppliers } from "@/lib/actions/analytics"
import { NewSupplierButton } from "@/components/new-supplier-button"
import { ExcelExportButton } from "@/components/excel-export-button"
import { MergeProvidersDialog } from "@/components/merge-providers-dialog"
import { SupplierAnalyticsSection } from "@/components/supplier-analytics-section"
import { SupplierWorkOrdersSection } from "@/components/supplier-work-orders-section"
import { SupplierMaterialsSection } from "@/components/supplier-materials-section"
import { HelpTooltip } from "@/components/help-tooltip"
import { helpContent } from "@/components/help-content"
import { prisma } from "@/lib/db"
import { ProviderType } from "@/generated/prisma"
import { DollarSign, Users, FileText, TrendingUp, Box } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { requireAuth } from "@/lib/auth-utils"

interface SuppliersPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function getSuppliersData(params: { [key: string]: string | string[] | undefined }) {
  const user = await requireAuth()

  const getString = (key: string) => {
    const value = params[key]
    return typeof value === "string" ? value : undefined
  }

  // Pagination parameters for different tabs
  const page = parseInt(getString("page") || '1', 10)
  const pageSize = 50 // Generous page size for performance
  const workOrdersPage = parseInt(getString("workOrdersPage") || '1', 10)
  const workOrdersPageSize = parseInt(getString("workOrdersPageSize") || '20', 10)
  const materialsPage = parseInt(getString("materialsPage") || '1', 10)
  const materialsPageSize = parseInt(getString("materialsPageSize") || '20', 10)

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

  // Build the filters for sub-queries
  const queryFilters = {
    supplierId,
    supplierCif,
    supplierType,
    workOrder,
    materialCategory,
    startDate,
    endDate
  }

  const [supplierData, categories, workOrders, allSuppliers, workOrdersData, materialsData] = await Promise.all([
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
      where: {
        userId: user.id,
        category: { not: null }
      },
      select: { category: true },
      distinct: ['category'],
      take: 100 // Limit categories to reasonable amount
    }).then(results => results.map(r => r.category!).filter(Boolean)),
    prisma.invoiceItem.findMany({
      where: {
        workOrder: { not: null },
        material: { userId: user.id },
        invoice: { provider: { userId: user.id } }
      },
      select: { workOrder: true },
      distinct: ['workOrder'],
      take: 500 // Limit work orders for performance
    }).then(results => results.map(r => r.workOrder!).filter(Boolean)),
    // Get all suppliers for the dropdown
    prisma.provider.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 1000 // Limit for performance
    }),
    // Get work orders data for suppliers with pagination
    getWorkOrdersForSuppliers({
      ...queryFilters,
      page: workOrdersPage,
      pageSize: workOrdersPageSize
    }),
    // Get materials data for suppliers with pagination
    getMaterialsForSuppliers({
      ...queryFilters,
      page: materialsPage,
      pageSize: materialsPageSize
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
    },
    workOrdersData: {
      ...workOrdersData,
      pagination: {
        currentPage: workOrdersData.currentPage,
        totalPages: workOrdersData.totalPages,
        pageSize: workOrdersData.pageSize
      }
    },
    materialsData: {
      ...materialsData,
      pagination: {
        currentPage: materialsData.currentPage,
        totalPages: materialsData.totalPages,
        pageSize: materialsData.pageSize
      }
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
        <Tabs defaultValue="suppliers" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Proveedores ({data.stats.totalSuppliers})
            </TabsTrigger>
            <TabsTrigger value="workorders" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Órdenes de Trabajo ({data.workOrdersData.totalWorkOrders})
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              Materiales ({data.materialsData.totalMaterials})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers" className="mt-6">
            <SupplierAnalyticsSection
              supplierAnalytics={data.supplierAnalytics}
              categories={data.categories}
              workOrders={data.workOrders}
              allSuppliers={data.allSuppliers}
              pagination={data.pagination}
            />
          </TabsContent>

          <TabsContent value="workorders" className="mt-6">
            <SupplierWorkOrdersSection
              workOrders={data.workOrdersData.workOrders}
              totalWorkOrders={data.workOrdersData.totalWorkOrders}
              totalCost={data.workOrdersData.totalCost}
              totalItems={data.workOrdersData.totalItems}
              pagination={data.workOrdersData.pagination}
              showAll={false}
            />
          </TabsContent>

          <TabsContent value="materials" className="mt-6">
            <SupplierMaterialsSection
              materials={data.materialsData.materials.filter(Boolean)}
              totalMaterials={data.materialsData.totalMaterials}
              totalCost={data.materialsData.totalCost}
              totalQuantity={data.materialsData.totalQuantity}
              totalSuppliers={data.stats.totalSuppliers}
              avgUnitPrice={data.materialsData.avgUnitPrice}
              pagination={data.materialsData.pagination}
              showAll={false}
            />
          </TabsContent>
        </Tabs>
      </Suspense>
    </div>
  )
}
