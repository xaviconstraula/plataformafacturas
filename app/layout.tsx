import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Gestión de Facturas",
  description: "Plataforma para la gestión y análisis de facturas",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen`}>
        {children}
        <ShadcnToaster />
        <SonnerToaster richColors closeButton />
      </body>
    </html>
  )
}
