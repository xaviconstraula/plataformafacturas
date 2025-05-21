import { Suspense } from "react"
import { ProviderList } from "@/components/provider-list"
import { getSuppliers } from "@/lib/actions/proveedores"
import { NewSupplierButton } from "@/components/new-supplier-button"

export default async function SuppliersPage() {
  const { suppliers } = await getSuppliers()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Proveedores</h1>
        <NewSupplierButton />
      </div>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <ProviderList providers={suppliers} />
      </Suspense>
    </div>
  )
}
