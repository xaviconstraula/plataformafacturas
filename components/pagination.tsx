"use client"

import { PaginationBar } from "./pagination-bar"

interface PaginationProps {
    currentPage: number
    totalPages: number
    itemsPerPage: number
    totalItems: number
}

export function Pagination({ currentPage, totalPages, itemsPerPage, totalItems }: PaginationProps) {
    const startItem = (currentPage - 1) * itemsPerPage + 1
    const endItem = Math.min(currentPage * itemsPerPage, totalItems)

    return (
        <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            summary={
                <>
                    Mostrando {startItem} a {endItem} de {totalItems} resultados
                </>
            }
        />
    )
}
