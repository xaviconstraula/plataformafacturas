'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePrefetchCommonData } from '@/hooks/use-analytics'

interface PrefetchDataProps {
    children: React.ReactNode
}

export function PrefetchData({ children }: PrefetchDataProps) {
    const queryClient = useQueryClient()
    const { mutate: prefetchCommonData } = usePrefetchCommonData()

    useEffect(() => {
        // Prefetch common data on component mount
        const prefetchTimer = setTimeout(() => {
            prefetchCommonData()
        }, 1000) // Delay prefetch to avoid blocking initial render

        return () => clearTimeout(prefetchTimer)
    }, [prefetchCommonData])

    // Prefetch data on user interactions
    useEffect(() => {
        const handleUserInteraction = () => {
            // Prefetch dashboard stats when user interacts
            queryClient.prefetchQuery({
                queryKey: ['dashboard-stats'],
                queryFn: async () => {
                    const response = await fetch('/api/dashboard/stats')
                    if (!response.ok) throw new Error('Failed to fetch dashboard stats')
                    return response.json()
                },
                staleTime: 2 * 60 * 1000,
            })
        }

        // Listen for user interactions
        const events = ['mousedown', 'touchstart', 'keydown']
        events.forEach(event => {
            document.addEventListener(event, handleUserInteraction, { once: true })
        })

        return () => {
            events.forEach(event => {
                document.removeEventListener(event, handleUserInteraction)
            })
        }
    }, [queryClient])

    // Prefetch on route changes
    useEffect(() => {
        const handleRouteChange = () => {
            // Prefetch frequently accessed data
            setTimeout(() => {
                prefetchCommonData()
            }, 500)
        }

        // Listen for navigation events
        window.addEventListener('popstate', handleRouteChange)

        return () => {
            window.removeEventListener('popstate', handleRouteChange)
        }
    }, [prefetchCommonData])

    return <>{children}</>
}

// Hook for prefetching specific page data
export function usePrefetchPageData() {
    const queryClient = useQueryClient()

    return {
        prefetchInvoices: (params: Record<string, string> = {}) => {
            const searchParams = new URLSearchParams(params)
            queryClient.prefetchQuery({
                queryKey: ['invoices', params],
                queryFn: async () => {
                    const response = await fetch(`/api/invoices?${searchParams}`)
                    if (!response.ok) throw new Error('Failed to fetch invoices')
                    return response.json()
                },
                staleTime: 2 * 60 * 1000,
            })
        },
        prefetchMaterials: () => {
            queryClient.prefetchQuery({
                queryKey: ['materials-analytics'],
                queryFn: async () => {
                    const response = await fetch('/api/analytics/materials')
                    if (!response.ok) throw new Error('Failed to fetch materials analytics')
                    return response.json()
                },
                staleTime: 5 * 60 * 1000,
            })
        },
        prefetchSuppliers: () => {
            queryClient.prefetchQuery({
                queryKey: ['suppliers-analytics'],
                queryFn: async () => {
                    const response = await fetch('/api/analytics/suppliers')
                    if (!response.ok) throw new Error('Failed to fetch suppliers analytics')
                    return response.json()
                },
                staleTime: 5 * 60 * 1000,
            })
        },
        prefetchWorkOrders: () => {
            queryClient.prefetchQuery({
                queryKey: ['work-orders'],
                queryFn: async () => {
                    const response = await fetch('/api/work-orders')
                    if (!response.ok) throw new Error('Failed to fetch work orders')
                    return response.json()
                },
                staleTime: 5 * 60 * 1000,
            })
        },
        prefetchAlerts: () => {
            queryClient.prefetchQuery({
                queryKey: ['price-alerts'],
                queryFn: async () => {
                    const response = await fetch('/api/alerts')
                    if (!response.ok) throw new Error('Failed to fetch alerts')
                    return response.json()
                },
                staleTime: 1 * 60 * 1000,
            })
        }
    }
}

// Component for prefetching on hover
export function PrefetchOnHover({
    children,
    prefetchFn,
    delay = 200
}: {
    children: React.ReactNode
    prefetchFn: () => void
    delay?: number
}) {
    const handleMouseEnter = () => {
        setTimeout(prefetchFn, delay)
    }

    return (
        <div onMouseEnter={handleMouseEnter}>
            {children}
        </div>
    )
} 