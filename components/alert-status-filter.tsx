"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export function AlertStatusFilter() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const currentStatus = searchParams.get("status") || "PENDING"

    const handleStatusChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("status", value)
        params.set("page", "1") // Reset to first page when changing filter
        router.push(`${pathname}?${params.toString()}`)
    }

    return (
        <Select value={currentStatus} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="APPROVED">Aprobadas</SelectItem>
                <SelectItem value="REJECTED">Rechazadas</SelectItem>
                <SelectItem value="ALL">Todas</SelectItem>
            </SelectContent>
        </Select>
    )
} 