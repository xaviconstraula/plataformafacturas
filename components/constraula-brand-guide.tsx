"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function ConstraulaBrandGuide() {
    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-3xl font-nexa-black text-constraula-black mb-2">
                    Manual de Identidad Corporativa - Constraula
                </h1>
                <p className="text-constraula-gray font-nexa-light">
                    Guía de implementación de los elementos visuales y tipográficos corporativos
                </p>
            </div>

            {/* Colores Corporativos */}
            <Card>
                <CardHeader>
                    <CardTitle className="font-nexa-bold">Colores Corporativos</CardTitle>
                    <CardDescription className="font-nexa-light">
                        Paleta de colores oficial según el manual de identidad de Constraula
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <div className="h-20 w-full bg-constraula-green rounded-lg border"></div>
                        <div className="text-sm">
                            <p className="font-nexa-bold">Verde Constraula</p>
                            <p className="font-nexa-light text-constraula-gray">#CDDE00</p>
                            <p className="font-nexa-light text-constraula-gray">PANTONE 389C</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="h-20 w-full bg-constraula-black rounded-lg border"></div>
                        <div className="text-sm">
                            <p className="font-nexa-bold">Negro</p>
                            <p className="font-nexa-light text-constraula-gray">#000000</p>
                            <p className="font-nexa-light text-constraula-gray">K 100</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="h-20 w-full bg-constraula-gray rounded-lg border"></div>
                        <div className="text-sm">
                            <p className="font-nexa-bold">Gris</p>
                            <p className="font-nexa-light text-constraula-gray">#9EABAA</p>
                            <p className="font-nexa-light text-constraula-gray">PANTONE 442C</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="h-20 w-full bg-constraula-white rounded-lg border"></div>
                        <div className="text-sm">
                            <p className="font-nexa-bold">Blanco</p>
                            <p className="font-nexa-light text-constraula-gray">#FFFFFF</p>
                            <p className="font-nexa-light text-constraula-gray">C 0 M 0 Y 0 K 0</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tipografía */}
            <Card>
                <CardHeader>
                    <CardTitle className="font-nexa-bold">Tipografía Corporativa</CardTitle>
                    <CardDescription className="font-nexa-light">
                        Familia tipográfica Nexa con sus variantes de peso
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-nexa-light">Nexa Light</h3>
                        <p className="text-constraula-gray font-nexa-light">
                            Texto ligero para contenido secundario y descripciones
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-nexa-regular">Nexa Regular</h3>
                        <p className="text-constraula-gray font-nexa-regular">
                            Peso normal para texto de cuerpo y contenido principal
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-nexa-bold">Nexa Bold</h3>
                        <p className="text-constraula-gray font-nexa-bold">
                            Peso negrita para títulos y elementos destacados
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-nexa-black">Nexa Black</h3>
                        <p className="text-constraula-gray font-nexa-black">
                            Peso máximo para títulos principales y logotipo
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Componentes con Identidad */}
            <Card>
                <CardHeader>
                    <CardTitle className="font-nexa-bold">Componentes con Identidad Corporativa</CardTitle>
                    <CardDescription className="font-nexa-light">
                        Ejemplos de componentes aplicando la identidad visual de Constraula
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Button className="bg-constraula-green text-constraula-black hover:bg-constraula-green/90 font-nexa-bold">
                            Botón Principal
                        </Button>
                        <Button variant="outline" className="border-constraula-green text-constraula-green hover:bg-constraula-green hover:text-constraula-black font-nexa-regular">
                            Botón Secundario
                        </Button>
                        <Button variant="ghost" className="text-constraula-gray hover:bg-constraula-gray/10 font-nexa-light">
                            Botón Terciario
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Badge className="bg-constraula-green text-constraula-black font-nexa-bold">
                            Estado Activo
                        </Badge>
                        <Badge variant="outline" className="border-constraula-gray text-constraula-gray font-nexa-light">
                            Estado Pendiente
                        </Badge>
                        <Badge variant="secondary" className="bg-constraula-gray/10 text-constraula-black font-nexa-regular">
                            Estado Completado
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Guía de Uso */}
            <Card>
                <CardHeader>
                    <CardTitle className="font-nexa-bold">Guía de Uso</CardTitle>
                    <CardDescription className="font-nexa-light">
                        Clases CSS disponibles para implementar la identidad corporativa
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-nexa-bold mb-2">Colores de Fondo:</h4>
                        <code className="text-sm font-nexa-light">
                            .bg-constraula-green, .bg-constraula-black, .bg-constraula-gray, .bg-constraula-white
                        </code>
                    </div>

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-nexa-bold mb-2">Colores de Texto:</h4>
                        <code className="text-sm font-nexa-light">
                            .text-constraula-green, .text-constraula-black, .text-constraula-gray, .text-constraula-white
                        </code>
                    </div>

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-nexa-bold mb-2">Tipografía:</h4>
                        <code className="text-sm font-nexa-light">
                            .font-nexa-light, .font-nexa-regular, .font-nexa-bold, .font-nexa-black
                        </code>
                    </div>

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-nexa-bold mb-2">Bordes:</h4>
                        <code className="text-sm font-nexa-light">
                            .border-constraula-green, .border-constraula-black, .border-constraula-gray, .border-constraula-white
                        </code>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 