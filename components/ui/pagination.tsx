"use client"

import { usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

interface PaginationProps {
  totalPages: number
}

export function Pagination({ totalPages }: PaginationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentPage = Number(searchParams.get("page")) || 1

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", pageNumber.toString())
    return `${pathname}?${params.toString()}`
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        variant="outline"
        className="gap-2"
        asChild
        disabled={currentPage <= 1}
      >
        <Link href={createPageURL(currentPage - 1)} prefetch>
          <ChevronLeftIcon className="h-4 w-4" />
          Previo
        </Link>
      </Button>

      <span className="text-sm text-muted-foreground">
        Página {currentPage} de {totalPages}
      </span>

      <Button
        variant="outline"
        className="gap-2"
        asChild
        disabled={currentPage >= totalPages}
      >
        <Link href={createPageURL(currentPage + 1)} prefetch>
          Siguiente
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}
