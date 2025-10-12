import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Contenidos de ayuda predefinidos para cada página
export const helpContent = {
    dashboard: {
        title: "Panel de Control - Ayuda",
        description: "Información sobre cómo usar e interpretar el panel principal",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Estadísticas Principales</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div><strong>Facturas Totales:</strong> Número total de facturas registradas en el sistema</div>
                        <div><strong>Proveedores:</strong> Cantidad de proveedores únicos activos</div>
                        <div><strong>Materiales:</strong> Número de materiales diferentes registrados</div>
                        <div><strong>Alertas de Precio:</strong> Alertas activas por aumentos significativos de precio</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Gráficos</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div><strong>Resumen:</strong> Muestra gastos por período y tendencias generales</div>
                        <div><strong>Alertas de Precios:</strong> Lista las alertas más recientes que requieren atención</div>
                    </CardContent>
                </Card>
            </div>
        )
    },

    facturas: {
        title: "Gestión de Facturas - Ayuda",
        description: "Guía rápida para subir y gestionar facturas",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Flujo Básico</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Selecciona o arrastra múltiples archivos PDF o haz clic para seleccionar</div>
                        <div>• El sistema extrae automáticamente toda la información</div>
                        <div>• Revisa y corrige antes de guardar</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Navegación</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Haz clic en el <strong>nombre del proveedor</strong> para ver su perfil</div>
                        <div>• Haz clic en el <strong>material</strong> para ver su historial</div>
                        <div>• Haz clic en cualquier <strong>factura</strong> para ver detalles</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Filtra por fecha, proveedor, material o montos</div>
                        <div>• Combina filtros para resultados específicos</div>
                        <div>• Usa &quot;Exportar&quot; para descargar datos filtrados</div>
                    </CardContent>
                </Card>
            </div>
        )
    },

    analytics: {
        title: "Analíticas - Ayuda",
        description: "Cómo interpretar gráficos y exportar reportes",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Gráficos Disponibles</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Gastos por período y proveedores</div>
                        <div>• Materiales más utilizados</div>
                        <div>• Evolución de precios en el tiempo</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Uso de Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Aplica filtros para enfocar el análisis</div>
                        <div>• Los gráficos se actualizan automáticamente</div>
                        <div>• Usa &quot;Exportar&quot; para descargar datos filtrados</div>
                    </CardContent>
                </Card>
            </div>
        )
    },

    alertas: {
        title: "Sistema de Alertas - Ayuda",
        description: "Cómo funciona la detección de aumentos de precio",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">¿Cómo funcionan?</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>El sistema compara precios de nuevas facturas con el historial.</div>
                        <div>Si detecta un aumento significativo (&gt;5%), genera una alerta.</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Niveles y Gestión</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• <span className="text-red-600 font-medium">Alto (&gt;20%)</span>: Atención inmediata</div>
                        <div>• <span className="text-yellow-600 font-medium">Medio (10-20%)</span>: Debe ser revisado</div>
                        <div>• <span className="text-blue-600 font-medium">Bajo (5-10%)</span>: Aumento notable</div>
                        <div>• Haz clic en una alerta para ver detalles y resolver</div>
                    </CardContent>
                </Card>
            </div>
        )
    },

    materiales: {
        title: "Gestión de Materiales - Ayuda",
        description: "Análisis detallado de materiales y su consumo",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Vista General</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Analiza el consumo y coste de cada material</div>
                        <div>• Identifica los materiales más utilizados y costosos</div>
                        <div>• Compara precios entre diferentes proveedores</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Filtros Disponibles</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• <strong>Búsqueda:</strong> Por nombre o código de material</div>
                        <div>• <strong>Categoría:</strong> Filtra por tipo de material</div>
                        <div>• <strong>Proveedor:</strong> Analiza compras de proveedor específico</div>
                        <div>• <strong>Rangos:</strong> Filtra por precios, costes o cantidades</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Navegación</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Haz clic en cualquier <strong>material</strong> para ver su historial completo</div>
                        <div>• Ve datos detallados de proveedores y precios</div>
                        <div>• Exporta análisis filtrados a Excel</div>
                    </CardContent>
                </Card>
            </div>
        )
    },

    proveedores: {
        title: "Gestión de Proveedores - Ayuda",
        description: "Análisis de rendimiento y gastos por proveedor",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Vista General</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Analiza el gasto total con cada proveedor</div>
                        <div>• Revisa frecuencia de facturación y materiales suministrados</div>
                        <div>• Compara rendimiento entre proveedores</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Métricas Clave</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• <strong>Gasto Total:</strong> Inversión acumulada con el proveedor</div>
                        <div>• <strong>N° Facturas:</strong> Frecuencia de transacciones</div>
                        <div>• <strong>Materiales:</strong> Diversidad de productos suministrados</div>
                        <div>• <strong>Promedio Factura:</strong> Importe medio por transacción</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Navegación</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Haz clic en cualquier <strong>proveedor</strong> para ver su perfil detallado</div>
                        <div>• Accede al historial completo de facturas y materiales</div>
                        <div>• Exporta datos de proveedores específicos</div>
                    </CardContent>
                </Card>
            </div>
        )
    },

    ordenesTrabajos: {
        title: "Órdenes de Trabajo - Ayuda",
        description: "Análisis de costes por orden de trabajo y centro de coste",
        content: (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">¿Qué son las OT?</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>Las Órdenes de Trabajo (OT) o Centros de Coste (CECO) permiten:</div>
                        <div>• Agrupar gastos por proyecto o actividad específica</div>
                        <div>• Controlar presupuestos de cada trabajo</div>
                        <div>• Analizar rentabilidad por proyecto</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Análisis Disponible</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• <strong>Coste Total:</strong> Gasto acumulado por OT (incluye IVA)</div>
                        <div>• <strong>Desglose por Proveedor:</strong> Quién ha facturado qué</div>
                        <div>• <strong>Desglose por Material:</strong> Qué materiales se han usado</div>
                        <div>• <strong>Evolución Temporal:</strong> Cómo ha evolucionado el gasto</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Filtros y Navegación</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>• Busca OT específicas por código</div>
                        <div>• Filtra por proveedor para ver su participación</div>
                        <div>• Haz clic en cualquier <strong>OT</strong> para ver el desglose completo</div>
                        <div>• Ordena por coste, cantidad de items o código</div>
                    </CardContent>
                </Card>
            </div>
        )
    }
}
