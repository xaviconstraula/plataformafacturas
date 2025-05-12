import { Suspense } from "react"
import { MaterialList } from "@/components/material-list"
import { getMaterials } from "@/lib/actions/materiales"
import { NewMaterialButton } from "@/components/new-material-button"

export default async function MaterialsPage() {
  const { materials } = await getMaterials()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Materiales</h1>
        <NewMaterialButton />
      </div>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <MaterialList materials={materials} />
      </Suspense>
    </div>
  )
}
