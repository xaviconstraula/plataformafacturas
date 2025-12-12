# Facturas Fácil 📄

Plataforma de gestión y análisis de facturas de proveedores con extracción automática mediante IA (Gemini).

## ✨ Características Principales

- **Extracción automática de datos**: Sube PDFs y la IA extrae automáticamente todos los datos relevantes
- **Procesamiento por lotes**: Procesa hasta 700 facturas simultáneamente con Gemini Batch API
- **Sistema de reintentos inteligente**: Detecta descuadres de totales y reintenta automáticamente (con Cloudflare R2)
- **Alertas de precios**: Detecta aumentos significativos de precios por material y proveedor
- **Analytics avanzado**: Visualiza gastos por material, proveedor, período y orden de trabajo (OT/CECO)
- **Gestión de materiales**: Organiza y agrupa materiales similares automáticamente
- **Multi-usuario**: Sistema de autenticación con Better Auth

## 🚀 Tecnologías

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, Shadcn UI
- **Backend**: Server Actions, Prisma ORM, PostgreSQL
- **IA**: Gemini 2.5 Flash (extracción de datos), Gemini Batch API
- **Storage**: Cloudflare R2 (opcional, para reintentos)
- **Autenticación**: Better Auth

## 📦 Instalación

### Prerrequisitos

- Node.js 18+
- PostgreSQL 14+
- Gemini API Key

### Setup

1. Clona el repositorio:
```bash
git clone <repository-url>
cd facturasfacil
```

2. Instala dependencias:
```bash
npm install
```

3. Configura variables de entorno:
```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/facturasfacil"
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3000"
GEMINI_API_KEY="your-gemini-api-key"

# Opcional - Sistema de reintentos con R2
R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="your-r2-access-key"
R2_SECRET_ACCESS_KEY="your-r2-secret-key"
R2_BUCKET_NAME="invoice-retries"
```

4. Inicializa la base de datos:
```bash
npx prisma db push
```

5. Ejecuta el servidor de desarrollo:
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 🔄 Sistema de Reintentos (Opcional)

El sistema incluye reintentos automáticos para facturas con descuadres de totales usando Cloudflare R2.

### Ventajas
- ✅ Detecta automáticamente descuadres en totales
- ✅ Reintenta hasta 3 veces adicionales
- ✅ Sin costos de egress con R2
- ✅ Limpieza automática después de 24h
- ✅ ~$0.007 por batch de 700 PDFs

### Configuración
Ver [R2_SETUP.md](./R2_SETUP.md) para instrucciones detalladas.

### Sin R2
El sistema funciona perfectamente sin R2. Las facturas con descuadres se marcan con `hasTotalsMismatch` para revisión manual.

## 📚 Documentación Adicional

- [INVOICE_RETRY_SYSTEM.md](./INVOICE_RETRY_SYSTEM.md) - Detalles técnicos del sistema de reintentos
- [R2_SETUP.md](./R2_SETUP.md) - Guía de configuración de Cloudflare R2
- [TEXT_FORMAT_MIGRATION.md](./TEXT_FORMAT_MIGRATION.md) - Migración de formato JSON a texto
- [ERROR_HANDLING_GUIDE.md](./ERROR_HANDLING_GUIDE.md) - Guía de manejo de errores

## 🏗️ Estructura del Proyecto

```
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # Rutas del dashboard
│   ├── api/               # API routes
│   ├── login/             # Autenticación
│   └── signup/
├── components/            # Componentes React
│   ├── ui/               # Componentes UI (Shadcn)
│   └── ...               # Componentes de negocio
├── lib/
│   ├── actions/          # Server Actions
│   ├── storage/          # Cliente R2
│   └── utils/            # Utilidades
├── prisma/
│   └── schema.prisma     # Schema de base de datos
└── generated/
    └── prisma/           # Cliente Prisma generado
```

## 📊 Características Destacadas

### Procesamiento por Lotes
- Hasta 700 facturas simultáneamente
- Procesamiento en segundo plano
- Barra de progreso en tiempo real
- Manejo robusto de errores

### Extracción Inteligente
- Formato texto (60-70% menos tokens que JSON)
- Soporte para descuentos secuenciales (ej: "50 5" = 52.5%)
- Detección automática de órdenes de trabajo (OT/CECO)
- Validación de totales con tolerancia configurable

### Analytics
- Gastos por material y período
- Top materiales por proveedor
- Evolución de precios
- Filtros avanzados (fecha, OT, proveedor)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor abre un issue primero para discutir cambios mayores.

## 📄 Licencia

[Especificar licencia]

---

Desarrollado con ❤️ usando Next.js y Gemini AI
