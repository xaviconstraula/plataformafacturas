import Sidebar from "@/components/sidebar"
import { BatchProgressBanner } from "@/components/batch-progress-banner"
import { AnalyticsPrefetch } from "@/components/analytics-prefetch"
import { requireAuth } from "@/lib/auth-utils"
import type { ReactNode } from "react"

export default async function DashboardLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    await requireAuth()

    return (
        <div className="flex min-h-screen h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <BatchProgressBanner />
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
                {/* Prefetch analytics data in the background */}
                <AnalyticsPrefetch />
            </main>
        </div>
    )
}
