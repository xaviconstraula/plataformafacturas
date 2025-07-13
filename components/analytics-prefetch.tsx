'use client'

import { useEffect } from "react"
import { getMaterialAnalyticsPaginated, getSupplierAnalyticsPaginated } from "@/lib/actions/analytics"

/**
 * Component to prefetch analytics data in the background
 * This helps warm up the cache for faster subsequent loads
 */
export function AnalyticsPrefetch() {
    useEffect(() => {
        // Prefetch analytics data in the background after component mounts
        const prefetchData = async () => {
            try {
                // Prefetch smaller chunks to warm up the cache
                await Promise.all([
                    getMaterialAnalyticsPaginated({
                        sortBy: 'cost',
                        sortOrder: 'desc',
                        pageSize: 10,
                        page: 1
                    }),
                    getSupplierAnalyticsPaginated({
                        includeMonthlyBreakdown: false, // Skip expensive monthly breakdown for prefetch
                        pageSize: 10,
                        page: 1
                    })
                ])
            } catch (error) {
                // Silently fail - this is just for prefetching
                console.debug('Analytics prefetch failed:', error)
            }
        }

        // Delay prefetch to not interfere with initial page load
        const timeoutId = setTimeout(prefetchData, 1000)

        return () => clearTimeout(timeoutId)
    }, [])

    return null // This component doesn't render anything
}
