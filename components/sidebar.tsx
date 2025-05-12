"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  FileTextIcon,
  HomeIcon,
  PackageIcon,
  TruckIcon,
  AlertTriangleIcon,
  MenuIcon,
  XIcon,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const navItems = [
  {
    name: "Panel",
    href: "/",
    icon: HomeIcon,
  },
  {
    name: "Facturas",
    href: "/facturas",
    icon: FileTextIcon,
  },
  {
    name: "Proveedores",
    href: "/proveedores",
    icon: TruckIcon,
  },
  {
    name: "Materiales",
    href: "/materiales",
    icon: PackageIcon,
  },
  {
    name: "Alertas",
    href: "/alertas",
    icon: AlertTriangleIcon,
  }
]

export default function Sidebar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <XIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
      </Button>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-background transition-transform duration-200 ease-in-out md:relative md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col border-r">
          <div className="p-6">
            <h2 className="text-2xl font-bold">Gestión de Facturas</h2>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium",
                  pathname === item.href
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="p-4">
            <p className="text-xs text-muted-foreground">© 2025 Gestión de Facturas</p>
          </div>
        </div>
      </div>
    </>
  )
}
