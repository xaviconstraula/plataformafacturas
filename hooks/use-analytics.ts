'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'

// Types for analytics data
interface MaterialAnalytics {
    materialId: string
    materialCode: string
    materialName: string
    category?: string
    totalQuantity: number
    totalCost: number
    averageUnitPrice: number
    invoiceCount: number
    supplierCount: number
    lastPurchaseDate: Date
}

interface SupplierAnalytics {
    supplierId: string
    supplierName: string
    supplierCif: string
    totalSpent: number
    invoiceCount: number
    materialCount: number
    averageInvoiceAmount: number
    lastInvoiceDate: Date
}

// Hook for materials analytics with caching
export function useMaterialsAnalytics(params?: {
    category?: string
    workOrder?: string
    supplierId?: string
    materialSearch?: string
    startDate?: Date
    endDate?: Date
    sortBy?: 'quantity' | 'cost' | 'lastPurchase' | 'name'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
}) {
    const searchParams = useSearchParams()

    // Get parameters from URL if not provided directly
    const queryParams = {
        category: params?.category || searchParams.get('category') || undefined,
        workOrder: params?.workOrder || searchParams.get('workOrder') || undefined,
        supplierId: params?.supplierId || searchParams.get('supplierId') || undefined,
        materialSearch: params?.materialSearch || searchParams.get('materialSearch') || undefined,
        sortBy: params?.sortBy || (searchParams.get('sortBy') as 'quantity' | 'cost' | 'lastPurchase' | 'name') || 'cost',
        sortOrder: params?.sortOrder || (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
        page: params?.page || parseInt(searchParams.get('page') || '1', 10),
        pageSize: params?.pageSize || 50,
        startDate: params?.startDate,
        endDate: params?.endDate,
    }

    return useQuery({
        queryKey: ['materials-analytics', queryParams],
        queryFn: async () => {
            const searchParamsStr = new URLSearchParams()

            Object.entries(queryParams).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    if (value instanceof Date) {
                        searchParamsStr.set(key, value.toISOString())
                    } else {
                        searchParamsStr.set(key, String(value))
                    }
                }
            })

            const response = await fetch(`/api/analytics/materials?${searchParamsStr}`)
            if (!response.ok) {
                throw new Error('Failed to fetch materials analytics')
            }
            return response.json()
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Hook for suppliers analytics with caching
export function useSuppliersAnalytics(params?: {
    supplierId?: string
    supplierType?: string
    supplierCif?: string
    workOrder?: string
    materialCategory?: string
    startDate?: Date
    endDate?: Date
    page?: number
    pageSize?: number
    sortBy?: 'spent' | 'invoices' | 'materials' | 'name'
    sortOrder?: 'asc' | 'desc'
}) {
    const searchParams = useSearchParams()

    const queryParams = {
        supplierId: params?.supplierId || searchParams.get('supplierId') || undefined,
        supplierType: params?.supplierType || searchParams.get('supplierType') || undefined,
        supplierCif: params?.supplierCif || searchParams.get('supplierCif') || undefined,
        workOrder: params?.workOrder || searchParams.get('workOrder') || undefined,
        materialCategory: params?.materialCategory || searchParams.get('materialCategory') || undefined,
        sortBy: params?.sortBy || (searchParams.get('sortBy') as 'spent' | 'invoices' | 'materials' | 'name') || 'spent',
        sortOrder: params?.sortOrder || (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
        page: params?.page || parseInt(searchParams.get('page') || '1', 10),
        pageSize: params?.pageSize || 50,
        startDate: params?.startDate,
        endDate: params?.endDate,
    }

    return useQuery({
        queryKey: ['suppliers-analytics', queryParams],
        queryFn: async () => {
            const searchParamsStr = new URLSearchParams()

            Object.entries(queryParams).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    if (value instanceof Date) {
                        searchParamsStr.set(key, value.toISOString())
                    } else {
                        searchParamsStr.set(key, String(value))
                    }
                }
            })

            const response = await fetch(`/api/analytics/suppliers?${searchParamsStr}`)
            if (!response.ok) {
                throw new Error('Failed to fetch suppliers analytics')
            }
            return response.json()
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Hook for dashboard stats with caching
export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const response = await fetch('/api/dashboard/stats')
            if (!response.ok) {
                throw new Error('Failed to fetch dashboard stats')
            }
            return response.json()
        },
        staleTime: 2 * 60 * 1000, // 2 minutes - shorter for dashboard stats
        gcTime: 5 * 60 * 1000, // 5 minutes
    })
}

// Hook for work orders with caching
export function useWorkOrders(params?: {
    sortBy?: string
    sortOrder?: string
    search?: string
    provider?: string
    page?: string
}) {
    const searchParams = useSearchParams()

    const queryParams = {
        sortBy: params?.sortBy || searchParams.get('sortBy') || 'totalCost',
        sortOrder: params?.sortOrder || searchParams.get('sortOrder') || 'desc',
        search: params?.search || searchParams.get('search') || undefined,
        provider: params?.provider || searchParams.get('provider') || undefined,
        page: params?.page || searchParams.get('page') || '1',
    }

    return useQuery({
        queryKey: ['work-orders', queryParams],
        queryFn: async () => {
            const searchParamsStr = new URLSearchParams()

            Object.entries(queryParams).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    searchParamsStr.set(key, String(value))
                }
            })

            const response = await fetch(`/api/work-orders?${searchParamsStr}`)
            if (!response.ok) {
                throw new Error('Failed to fetch work orders')
            }
            return response.json()
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Mutation for invalidating analytics data after data changes
export function useInvalidateAnalytics() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (type: 'materials' | 'suppliers' | 'dashboard' | 'work-orders' | 'all') => {
            if (type === 'all') {
                await queryClient.invalidateQueries({ queryKey: ['materials-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['suppliers-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
                await queryClient.invalidateQueries({ queryKey: ['work-orders'] })
            } else if (type === 'materials') {
                await queryClient.invalidateQueries({ queryKey: ['materials-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            } else if (type === 'suppliers') {
                await queryClient.invalidateQueries({ queryKey: ['suppliers-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            } else if (type === 'dashboard') {
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            } else if (type === 'work-orders') {
                await queryClient.invalidateQueries({ queryKey: ['work-orders'] })
            }
        }
    })
} 