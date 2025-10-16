'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { getActiveBatches } from '@/lib/actions/invoices'
import { getMaterialById } from '@/lib/actions/materiales'

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

// Minimal type for alerts list items
interface PriceAlertSummary {
    id: string
    oldPrice: number
    newPrice: number
    percentage: number
    createdAt: string
    materialId: string
    providerId: string
    materialName: string
    providerName: string
}

// Hook for price alerts with caching
export function usePriceAlerts() {
    return useQuery<PriceAlertSummary[]>({
        queryKey: ['price-alerts'],
        queryFn: async () => {
            const response = await fetch('/api/alerts')
            if (!response.ok) {
                throw new Error('Failed to fetch price alerts')
            }
            return response.json()
        },
        staleTime: 1 * 60 * 1000, // 1 minute - alerts should be fresh
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
        refetchOnWindowFocus: true,
    })
}

// Hook for batch progress with polling
export function useBatchProgress() {
    return useQuery({
        queryKey: ['batch-progress'],
        queryFn: async () => {
            return await getActiveBatches()
        },
        staleTime: 2 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchInterval: 5 * 1000, // Poll every 5 seconds for faster error detection (was 30s)
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        enabled: typeof window !== 'undefined', // Only run on client side
    })
}

// Hook for individual material details
export function useMaterial(materialId: string | null) {
    return useQuery({
        queryKey: ['material', materialId],
        queryFn: async () => {
            if (!materialId) throw new Error('Material ID is required')
            const result = await getMaterialById(materialId)
            if (!result.material) {
                throw new Error(result.error || 'Material not found')
            }
            return result.material
        },
        enabled: !!materialId,
        staleTime: 10 * 60 * 1000, // 10 minutes - material data is relatively static
        gcTime: 30 * 60 * 1000, // 30 minutes
    })
}

// Hook for invoices with caching
export function useInvoices(params?: {
    search?: string
    workOrder?: string
    month?: string
    quarter?: string
    year?: string
    fiscalYear?: string
    supplier?: string
    material?: string
    category?: string
    supplierCif?: string
    minAmount?: number
    maxAmount?: number
    minUnitPrice?: number
    maxUnitPrice?: number
    page?: number
    pageSize?: number
}) {
    const searchParams = useSearchParams()

    const queryParams = {
        search: params?.search || searchParams.get('search') || undefined,
        workOrder: params?.workOrder || searchParams.get('workOrder') || undefined,
        month: params?.month || searchParams.get('month') || undefined,
        quarter: params?.quarter || searchParams.get('quarter') || undefined,
        year: params?.year || searchParams.get('year') || undefined,
        fiscalYear: params?.fiscalYear || searchParams.get('fiscalYear') || undefined,
        supplier: params?.supplier || searchParams.get('supplier') || undefined,
        material: params?.material || searchParams.get('material') || undefined,
        category: params?.category || searchParams.get('category') || undefined,
        supplierCif: params?.supplierCif || searchParams.get('supplierCif') || undefined,
        minAmount: params?.minAmount || (searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined),
        maxAmount: params?.maxAmount || (searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined),
        minUnitPrice: params?.minUnitPrice || (searchParams.get('minUnitPrice') ? parseFloat(searchParams.get('minUnitPrice')!) : undefined),
        maxUnitPrice: params?.maxUnitPrice || (searchParams.get('maxUnitPrice') ? parseFloat(searchParams.get('maxUnitPrice')!) : undefined),
        page: params?.page || parseInt(searchParams.get('page') || '1', 10),
        pageSize: params?.pageSize || 50,
    }

    return useQuery({
        queryKey: ['invoices', queryParams],
        queryFn: async () => {
            const searchParamsStr = new URLSearchParams()

            Object.entries(queryParams).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    searchParamsStr.set(key, String(value))
                }
            })

            const response = await fetch(`/api/invoices?${searchParamsStr}`)
            if (!response.ok) {
                throw new Error('Failed to fetch invoices')
            }
            return response.json()
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Hook for providers/suppliers with caching
export function useProviders(params?: { page?: number; pageSize?: number }) {
    const page = params?.page || 1
    const pageSize = params?.pageSize || 100

    return useQuery({
        queryKey: ['providers', page, pageSize],
        queryFn: async () => {
            const searchParams = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize)
            })
            const response = await fetch(`/api/providers?${searchParams}`)
            if (!response.ok) {
                throw new Error('Failed to fetch providers')
            }
            return response.json()
        },
        staleTime: 15 * 60 * 1000, // 15 minutes - providers don't change often
        gcTime: 30 * 60 * 1000, // 30 minutes
    })
}

// Hook for materials with caching
export function useMaterials(params?: { page?: number; pageSize?: number }) {
    const page = params?.page || 1
    const pageSize = params?.pageSize || 200

    return useQuery({
        queryKey: ['materials', page, pageSize],
        queryFn: async () => {
            const searchParams = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize)
            })
            const response = await fetch(`/api/materials?${searchParams}`)
            if (!response.ok) {
                throw new Error('Failed to fetch materials')
            }
            return response.json()
        },
        staleTime: 15 * 60 * 1000, // 15 minutes - materials don't change often
        gcTime: 30 * 60 * 1000, // 30 minutes
    })
}

// Hook for categories with caching
export function useCategories() {
    return useQuery({
        queryKey: ['categories'],
        queryFn: async () => {
            const response = await fetch('/api/categories')
            if (!response.ok) {
                throw new Error('Failed to fetch categories')
            }
            return response.json()
        },
        staleTime: 30 * 60 * 1000, // 30 minutes - categories are very static
        gcTime: 60 * 60 * 1000, // 1 hour
    })
}

// Hook for work orders with caching
export function useWorkOrdersList() {
    return useQuery({
        queryKey: ['work-orders-list'],
        queryFn: async () => {
            const response = await fetch('/api/work-orders/list')
            if (!response.ok) {
                throw new Error('Failed to fetch work orders')
            }
            return response.json()
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
        gcTime: 20 * 60 * 1000, // 20 minutes
    })
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

// Hook for prefetching commonly used data
export function usePrefetchCommonData() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async () => {
            // Prefetch providers, materials, and categories
            await Promise.all([
                queryClient.prefetchQuery({
                    queryKey: ['providers', 1, 100],
                    queryFn: async () => {
                        const response = await fetch('/api/providers?page=1&pageSize=100')
                        if (!response.ok) throw new Error('Failed to fetch providers')
                        return response.json()
                    },
                    staleTime: 15 * 60 * 1000,
                }),
                queryClient.prefetchQuery({
                    queryKey: ['materials', 1, 200],
                    queryFn: async () => {
                        const response = await fetch('/api/materials?page=1&pageSize=200')
                        if (!response.ok) throw new Error('Failed to fetch materials')
                        return response.json()
                    },
                    staleTime: 15 * 60 * 1000,
                }),
                queryClient.prefetchQuery({
                    queryKey: ['categories'],
                    queryFn: async () => {
                        const response = await fetch('/api/categories')
                        if (!response.ok) throw new Error('Failed to fetch categories')
                        return response.json()
                    },
                    staleTime: 30 * 60 * 1000,
                }),
            ])
        }
    })
}

// Mutation for invalidating analytics data after data changes
export function useInvalidateAnalytics() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (type: 'materials' | 'suppliers' | 'dashboard' | 'work-orders' | 'invoices' | 'price-alerts' | 'batch-progress' | 'all') => {
            if (type === 'all') {
                await queryClient.invalidateQueries({ queryKey: ['materials-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['suppliers-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
                await queryClient.invalidateQueries({ queryKey: ['work-orders'] })
                await queryClient.invalidateQueries({ queryKey: ['invoices'] })
                await queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
                await queryClient.invalidateQueries({ queryKey: ['batch-progress'] })
                await queryClient.invalidateQueries({ queryKey: ['providers'] })
                await queryClient.invalidateQueries({ queryKey: ['materials'] })
                await queryClient.invalidateQueries({ queryKey: ['categories'] })
            } else if (type === 'materials') {
                await queryClient.invalidateQueries({ queryKey: ['materials-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
                await queryClient.invalidateQueries({ queryKey: ['materials'] })
            } else if (type === 'suppliers') {
                await queryClient.invalidateQueries({ queryKey: ['suppliers-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
                await queryClient.invalidateQueries({ queryKey: ['providers'] })
            } else if (type === 'dashboard') {
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            } else if (type === 'work-orders') {
                await queryClient.invalidateQueries({ queryKey: ['work-orders'] })
                await queryClient.invalidateQueries({ queryKey: ['work-orders-list'] })
            } else if (type === 'invoices') {
                await queryClient.invalidateQueries({ queryKey: ['invoices'] })
                await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
                await queryClient.invalidateQueries({ queryKey: ['materials-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['suppliers-analytics'] })
                await queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
            } else if (type === 'price-alerts') {
                await queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
            } else if (type === 'batch-progress') {
                await queryClient.invalidateQueries({ queryKey: ['batch-progress'] })
            }
        }
    })
}

// Hook for optimistic updates when creating/updating data
export function useOptimisticUpdate() {
    const queryClient = useQueryClient()

    return {
        updateInvoicesList: (newInvoice: unknown) => {
            queryClient.setQueryData(['invoices'], (old: unknown) => {
                if (!old || typeof old !== 'object') return old
                const invoicesData = old as { invoices: unknown[], totalCount: number }
                return {
                    ...invoicesData,
                    invoices: [newInvoice, ...invoicesData.invoices],
                    totalCount: invoicesData.totalCount + 1
                }
            })
        },
        updateMaterialsList: (newMaterial: unknown) => {
            queryClient.setQueryData(['materials'], (old: unknown) => {
                if (!old || !Array.isArray(old)) return old
                return [...old, newMaterial]
            })
        },
        updateProvidersList: (newProvider: unknown) => {
            queryClient.setQueryData(['providers'], (old: unknown) => {
                if (!old || !Array.isArray(old)) return old
                return [...old, newProvider]
            })
        }
    }
} 