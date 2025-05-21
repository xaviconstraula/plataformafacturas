import Sidebar from "@/components/sidebar"
import type { ReactNode } from "react"

export default function DashboardLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    return (
        <div className="flex min-h-screen h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6 bg-background">{children}</main>
        </div>
    )
}
