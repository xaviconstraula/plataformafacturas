import Sidebar from "@/components/sidebar"
import { BatchProgressBannerWrapper } from "@/components/batch-progress-banner-wrapper"
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
                <div className="max-w-7xl mx-auto">
                    <BatchProgressBannerWrapper />
                    {children}
                </div>
                {/* Removed aggressive analytics prefetch to reduce unnecessary load */}
            </main>
        </div>
    )
}
