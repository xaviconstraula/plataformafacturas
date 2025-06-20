import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"

export const metadata: Metadata = {
  title: "Constraula - Gestión de Facturas",
  description: "Plataforma para la gestión y análisis de facturas de Constraula",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen">
        {children}
        <ShadcnToaster />
        <SonnerToaster richColors closeButton />
      </body>
    </html>
  )
}
