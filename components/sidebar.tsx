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
  BarChart3Icon,
  ClipboardListIcon,
  HelpCircleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import Image from "next/image"

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
    name: "Analíticas",
    href: "/analytics",
    icon: BarChart3Icon,
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
    name: "Órdenes de Trabajo",
    href: "/ordenes-trabajo",
    icon: ClipboardListIcon,
  },
  {
    name: "Alertas",
    href: "/alertas",
    icon: AlertTriangleIcon,
  },
  {
    name: "Ayuda",
    href: "/ayuda",
    icon: HelpCircleIcon,
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
            <div className="flex items-center gap-3">
              <Image
                src="/logofull.png"
                alt="Constraula"
                className="h-10 w-auto"
                width={100}
                height={100}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <h2 className="text-2xl font-nexa-bold text-constraula-black hidden">Constraula</h2>
            </div>
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
            <p className="text-xs text-muted-foreground font-nexa-light">© 2025 Constraula</p>
          </div>
        </div>
      </div>
    </>
  )
}
