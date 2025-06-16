import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

interface PaginationProps {
    currentPage: number
    totalPages: number
    itemsPerPage: number
    totalItems: number
}

export function Pagination({ currentPage, totalPages, itemsPerPage, totalItems }: PaginationProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    function createPageURL(pageNumber: number) {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', pageNumber.toString())
        return `?${params.toString()}`
    }

    const startItem = (currentPage - 1) * itemsPerPage + 1
    const endItem = Math.min(currentPage * itemsPerPage, totalItems)

    // Calculate page numbers to show
    const showPages = Math.min(5, totalPages)
    let startPage = Math.max(1, currentPage - Math.floor(showPages / 2))
    const endPage = Math.min(totalPages, startPage + showPages - 1)

    // Adjust if we're near the end
    if (endPage - startPage < showPages - 1) {
        startPage = Math.max(1, endPage - showPages + 1)
    }

    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

    if (totalPages <= 1) return null

    return (
        <div className="flex items-center justify-between px-2">
            <div className="text-sm text-muted-foreground">
                Mostrando {startItem} a {endItem} de {totalItems} resultados
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(createPageURL(currentPage - 1), { scroll: false })}
                    disabled={currentPage <= 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                </Button>

                {pages.map((page) => (
                    <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => router.push(createPageURL(page), { scroll: false })}
                    >
                        {page}
                    </Button>
                ))}

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(createPageURL(currentPage + 1), { scroll: false })}
                    disabled={currentPage >= totalPages}
                >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
} 