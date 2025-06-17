
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    FileTextIcon,
    HomeIcon,
    PackageIcon,
    TruckIcon,
    AlertTriangleIcon,
    BarChart3Icon,
    ClipboardListIcon,
    UploadIcon,
    FilterIcon,
    DownloadIcon,
    SearchIcon,
    EditIcon,
    TrashIcon,
    PlusIcon,
    EyeIcon
} from "lucide-react"

export default function AyudaPage() {
    return (
        <div className="flex flex-col gap-8 max-w-6xl">
            <div>
                <h1 className="text-3xl font-bold">Manual de Uso</h1>
                <p className="text-muted-foreground mt-2">
                    Guía rápida para utilizar todas las funcionalidades del sistema de gestión de facturas
                </p>
            </div>

            {/* Flujo Básico */}
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
                        Flujo Básico de la Aplicación
                    </CardTitle>
                    <CardDescription>
                        Sigue estos pasos para aprovechar al máximo el sistema
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">1</div>
                            <div>
                                <h4 className="font-semibold text-sm">Sube tus facturas</h4>
                                <p className="text-sm text-muted-foreground">Ve a la sección &quot;Facturas&quot; y selecciona o arrastra múltiples archivos PDF. El sistema extrae automáticamente toda la información.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">2</div>
                            <div>
                                <h4 className="font-semibold text-sm">Análisis automático</h4>
                                <p className="text-sm text-muted-foreground">El sistema procesa las facturas, identifica proveedores y materiales, y detecta automáticamente aumentos de precio.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">3</div>
                            <div>
                                <h4 className="font-semibold text-sm">Explora con filtros</h4>
                                <p className="text-sm text-muted-foreground">Usa los filtros en cada página para analizar por períodos, proveedores, materiales o montos específicos.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">💡</div>
                            <div>
                                <h4 className="font-semibold text-sm">Navega fácilmente</h4>
                                <p className="text-sm text-muted-foreground">Haz clic en cualquier <strong>nombre de proveedor</strong>, <strong>material</strong> o <strong>factura</strong> para ver información detallada.</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navegación Rápida */}
            <Card>
                <CardHeader>
                    <CardTitle>Navegación Rápida</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <a href="#facturas" className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted transition-colors">
                            <FileTextIcon className="h-4 w-4" />
                            <span className="text-sm">Facturas</span>
                        </a>
                        <a href="#analytics" className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted transition-colors">
                            <BarChart3Icon className="h-4 w-4" />
                            <span className="text-sm">Analíticas</span>
                        </a>
                        <a href="#alertas" className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted transition-colors">
                            <AlertTriangleIcon className="h-4 w-4" />
                            <span className="text-sm">Alertas</span>
                        </a>
                        <a href="#filtros" className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted transition-colors">
                            <FilterIcon className="h-4 w-4" />
                            <span className="text-sm">Filtros</span>
                        </a>
                    </div>
                </CardContent>
            </Card>



            {/* Facturas */}
            <Card id="facturas">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileTextIcon className="h-5 w-5" />
                        Gestión de Facturas
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">Subir Facturas</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Arrastra múltiples archivos PDF o haz clic para seleccionar</li>
                            <li>• El sistema extrae automáticamente toda la información</li>
                            <li>• Revisa y corrige antes de guardar</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Navegación</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Haz clic en el <strong>nombre del proveedor</strong> para ver su perfil completo</li>
                            <li>• Haz clic en el <strong>material</strong> para ver su historial de precios</li>
                            <li>• Haz clic en cualquier <strong>factura</strong> para ver todos sus detalles</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Analíticas */}
            <Card id="analytics">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3Icon className="h-5 w-5" />
                        Analíticas y Reportes
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">Gráficos Disponibles</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Gastos por período y proveedores</li>
                            <li>• Materiales más utilizados</li>
                            <li>• Evolución de precios en el tiempo</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Exportar Datos</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Usa el botón &quot;Exportar&quot; para descargar en Excel</li>
                            <li>• Los datos se exportan según los filtros aplicados</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>



            {/* Alertas */}
            <Card id="alertas">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangleIcon className="h-5 w-5" />
                        Sistema de Alertas
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">¿Cómo funcionan?</h4>
                        <p className="text-sm text-muted-foreground">
                            El sistema compara automáticamente precios de nuevas facturas con el historial.
                            Si detecta un aumento significativo (&gt;5%), genera una alerta.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Niveles de Alerta</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• <span className="text-red-600 font-medium">Alto (&gt;20%)</span>: Atención inmediata</li>
                            <li>• <span className="text-yellow-600 font-medium">Medio (10-20%)</span>: Debe ser revisado</li>
                            <li>• <span className="text-blue-600 font-medium">Bajo (5-10%)</span>: Aumento notable</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Gestión</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Haz clic en una alerta para ver detalles</li>
                            <li>• Marca como resuelta después de revisar</li>
                            <li>• Usa filtros por estado o prioridad</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Filtros */}
            <Card id="filtros">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FilterIcon className="h-5 w-5" />
                        Guía de Filtros
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">Filtros Disponibles</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• <strong>Fecha:</strong> Por mes, trimestre, año o rango personalizado</li>
                            <li>• <strong>Proveedor:</strong> Selecciona proveedores específicos</li>
                            <li>• <strong>Material:</strong> Busca por tipo de material</li>
                            <li>• <strong>Montos:</strong> Filtra por rangos de importes</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Consejos</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Combina múltiples filtros para resultados específicos</li>
                            <li>• Los filtros se aplican automáticamente</li>
                            <li>• Usa &quot;Limpiar filtros&quot; para resetear</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>


        </div>
    )
}