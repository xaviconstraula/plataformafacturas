import { Suspense } from "react"
import { MaterialList } from "@/components/material-list"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { getMaterials } from "@/lib/actions/materiales"

export default async function MaterialsPage() {
  const { materials } = await getMaterials()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Materiales</h1>
        <Link href="/materiales/nuevo">
          <Button>
            <PlusIcon className="mr-2 h-4 w-4" />
            Nuevo Material
          </Button>
        </Link>
      </div>

      <Suspense fallback={<div className="h-96 rounded-lg bg-muted animate-pulse" />}>
        <MaterialList materials={materials} />
      </Suspense>
    </div>
  )
}
