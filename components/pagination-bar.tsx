"use client"

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"

type PageItem = number | "ellipsis"

interface PaginationBarProps {
    currentPage: number
    totalPages: number
    pageParam?: string
    summary?: ReactNode
    className?: string
}

export function getVisiblePageNumbers(currentPage: number, totalPages: number): PageItem[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1)
    }

    const result: PageItem[] = [1]

    let rangeStart: number
    let rangeEnd: number

    if (currentPage <= 3) {
        rangeStart = 2
        rangeEnd = Math.min(3, totalPages - 1)
    } else if (currentPage >= totalPages - 2) {
        rangeStart = Math.max(2, totalPages - 3)
        rangeEnd = totalPages - 1
    } else {
        rangeStart = currentPage - 1
        rangeEnd = currentPage + 1
    }

    if (rangeStart > 2) {
        result.push("ellipsis")
    }

    for (let page = rangeStart; page <= rangeEnd; page++) {
        result.push(page)
    }

    if (rangeEnd < totalPages - 1) {
        result.push("ellipsis")
    }

    result.push(totalPages)
    return result
}

export function PaginationBar({
    currentPage,
    totalPages,
    pageParam = "page",
    summary,
    className,
}: PaginationBarProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [pageInput, setPageInput] = useState(String(currentPage))

    useEffect(() => {
        setPageInput(String(currentPage))
    }, [currentPage])

    if (totalPages <= 1) {
        return null
    }

    function createPageURL(pageNumber: number) {
        const params = new URLSearchParams(searchParams.toString())
        params.set(pageParam, pageNumber.toString())
        return `?${params.toString()}`
    }

    function navigateToPage(pageNumber: number) {
        const clampedPage = Math.min(Math.max(1, pageNumber), totalPages)
        if (clampedPage === currentPage) {
            setPageInput(String(currentPage))
            return
        }
        router.push(createPageURL(clampedPage), { scroll: false })
    }

    function handlePageInputCommit() {
        const trimmed = pageInput.trim()
        if (!trimmed) {
            setPageInput(String(currentPage))
            return
        }

        const parsed = Number.parseInt(trimmed, 10)
        if (Number.isNaN(parsed)) {
            setPageInput(String(currentPage))
            return
        }

        navigateToPage(parsed)
    }

    function handlePageInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            event.preventDefault()
            handlePageInputCommit()
            event.currentTarget.blur()
        }
    }

    const visiblePages = getVisiblePageNumbers(currentPage, totalPages)

    return (
        <div
            className={cn(
                "flex items-center px-2 gap-4",
                summary ? "justify-between" : "justify-end",
                className
            )}
        >
            {summary ? (
                <div className="text-sm text-muted-foreground shrink-0">{summary}</div>
            ) : null}
            <div className="flex items-center flex-wrap justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                </Button>

                {visiblePages.map((item, index) =>
                    item === "ellipsis" ? (
                        <span
                            key={`ellipsis-${index}`}
                            className="px-1 text-sm text-muted-foreground select-none"
                            aria-hidden
                        >
                            ...
                        </span>
                    ) : (
                        <Button
                            key={item}
                            variant={item === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => navigateToPage(item)}
                            aria-current={item === currentPage ? "page" : undefined}
                        >
                            {item}
                        </Button>
                    )
                )}

                <div className="flex items-center gap-1">
                    <Input
                        type="text"
                        inputMode="numeric"
                        min={1}
                        max={totalPages}
                        value={pageInput}
                        onChange={(event) => setPageInput(event.target.value)}
                        onBlur={handlePageInputCommit}
                        onKeyDown={handlePageInputKeyDown}
                        aria-label="Ir a página"
                        className="h-8 w-12 px-2 text-center"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                        / {totalPages}
                    </span>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
