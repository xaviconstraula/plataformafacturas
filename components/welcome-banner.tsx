"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, HelpCircle, FileText, BarChart3, AlertTriangle } from "lucide-react"

export function WelcomeBanner() {
    const [isVisible, setIsVisible] = useState(true)

    if (!isVisible) return null

    return (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                            <HelpCircle className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">¡Bienvenido al Sistema de Gestión de Facturas!</CardTitle>
                            <CardDescription>
                                Administra tus facturas, proveedores y obtén insights valiosos sobre tus compras
                            </CardDescription>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsVisible(false)}
                        className="h-8 w-8 p-0"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-blue-100">
                            <FileText className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                            <h4 className="font-medium text-sm">Gestiona Facturas</h4>
                            <p className="text-xs text-muted-foreground">
                                Sube PDFs y extrae información automáticamente
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-green-100">
                            <BarChart3 className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                            <h4 className="font-medium text-sm">Analiza Gastos</h4>
                            <p className="text-xs text-muted-foreground">
                                Visualiza tendencias y patrones de compra
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-orange-100">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                            <h4 className="font-medium text-sm">Recibe Alertas</h4>
                            <p className="text-xs text-muted-foreground">
                                Detecta aumentos de precios automáticamente
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                    <Badge variant="outline" className="text-xs">
                        💡 Consejo
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                        ¿Necesitas ayuda? Haz clic en el ícono de ayuda (?) en cualquier página o visita el
                    </span>
                    <Link href="/ayuda" className="text-xs text-blue-600 hover:underline font-medium">
                        Manual de Uso
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
} 