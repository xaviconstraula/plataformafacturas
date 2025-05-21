import Sidebar from "@/components/sidebar"
import { getUser } from "@/lib/user";
import type { ReactNode } from "react"

export default async function DashboardLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {

    await getUser();
    return (
        <div className="flex min-h-screen h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6 bg-background">{children}</main>
        </div>
    )
}
