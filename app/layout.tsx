import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryProvider } from "@/lib/query-client"
import { getCurrentUser } from "@/lib/auth-utils"
import { prisma } from "@/lib/db"

export const metadata: Metadata = {
  title: "Constraula - Gestión de Facturas",
  description: "Plataforma para la gestión y análisis de facturas de Constraula",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getCurrentUser()
  let pack = "lime"
  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { themePack: true },
    })
    pack = dbUser?.themePack ?? "lime"
  }

  return (
    <html lang="es" suppressHydrationWarning data-pack={pack}>
      <body className="min-h-screen">
        <QueryProvider>
          {children}
        </QueryProvider>
        <ShadcnToaster />
        <SonnerToaster richColors closeButton />
      </body>
    </html>
  )
}
