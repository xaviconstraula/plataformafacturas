"use client"

import { useSearchParams } from "next/navigation"
import { PaginationBar } from "@/components/pagination-bar"

interface PaginationProps {
    totalPages: number
    pageParam?: string
}

export function Pagination({ totalPages, pageParam = "page" }: PaginationProps) {
    const searchParams = useSearchParams()
    const currentPage = Number(searchParams.get(pageParam)) || 1

    return (
        <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            pageParam={pageParam}
            className="justify-center"
        />
    )
}
