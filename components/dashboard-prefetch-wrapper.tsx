'use client'

import { PrefetchData } from './prefetch-data'

interface DashboardPrefetchWrapperProps {
    children: React.ReactNode
}

export function DashboardPrefetchWrapper({ children }: DashboardPrefetchWrapperProps) {
    return (
        <PrefetchData>
            {children}
        </PrefetchData>
    )
} 