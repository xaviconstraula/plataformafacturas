# Sistema de Reintentos y Almacenamiento de PDFs con Cloudflare R2

Sistema automático de reintentos para facturas con descuadre de totales y almacenamiento permanente de PDFs usando Cloudflare R2.

## ¿Qué hace?

### Reintentos Automáticos
Cuando una factura se procesa y se detecta un descuadre entre los totales calculados y extraídos:
1. Descarga el PDF original desde Cloudflare R2
2. Lo reenvía a Gemini hasta 3 veces adicionales
3. Si algún intento tiene éxito, guarda el resultado correcto
4. Si todos fallan, marca la factura para revisión manual

### Almacenamiento Permanente de PDFs
- Los PDFs se guardan permanentemente en R2
- Se pueden visualizar desde la página de detalles de cada factura
- Botón "Ver PDF" en la interfaz abre el documento en una nueva pestaña
- URLs públicas o con dominio personalizado

## Configuración

### 1. Crear cuenta y bucket en Cloudflare R2

1. Ve a [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2 Object Storage
2. Crea un nuevo bucket llamado `invoice-retries`
3. Configura acceso público al bucket:
   - Ve a "Settings" del bucket
   - En "Public access" habilita "Allow Access"
   - Esto genera una URL pública como `https://pub-xxxxx.r2.dev`
4. Ve a "Manage R2 API Tokens" y crea un nuevo token con permisos:
   - **Edit** permissions para el bucket `invoice-retries`
5. Copia el **Access Key ID**, **Secret Access Key** y **Endpoint**

### 2. (Opcional) Configurar dominio personalizado

Para URLs más profesionales:
1. En el bucket, ve a "Settings" → "Custom Domains"
2. Añade tu dominio (ej: `facturas.tuempresa.com`)
3. Sigue las instrucciones para configurar DNS
4. Usa este dominio en `R2_PUBLIC_URL`

### 3. Configurar variables de entorno

Añade estas variables a tu archivo `.env`:

```env
# Cloudflare R2 (Obligatorio para ver PDFs y reintentos)
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=invoice-retries

# Opcional: Dominio personalizado para URLs más limpias
R2_PUBLIC_URL=https://facturas.tuempresa.com
```

### 4. ~~(Ya NO recomendado) Configurar Lifecycle Policy~~

**Nota**: Ya NO configuramos lifecycle policies porque los PDFs se guardan permanentemente para poder verlos en la UI.

## Funcionamiento

### Sin R2 configurado
- ✅ El sistema funciona normalmente
- ❌ No hay reintentos automáticos
- ❌ No se pueden ver PDFs en la interfaz
- ℹ️ Facturas con descuadre se marcan con `hasTotalsMismatch` para revisión manual

### Con R2 configurado
- ✅ PDFs se suben a R2 durante el procesamiento
- ✅ Reintentos automáticos (hasta 3 intentos adicionales)
- ✅ PDFs visibles en la página de detalles de factura
- ✅ Almacenamiento permanente (no hay expiración)
- ✅ URLs públicas para acceso directo

## Costos

Cloudflare R2 tiene pricing muy competitivo:

### Almacenamiento
- **$0.015/GB/mes** - Para 700 facturas (~3.5 GB): **$0.05/mes**
- Sin límite de tiempo - almacenamiento permanente

### Operaciones
- **Class A** (escrituras): $4.50 por millón
  - 700 uploads/batch × 30 batches/mes = 21,000 ops = **$0.09/mes**
- **Class B** (lecturas): $0.36 por millón
  - ~2,100 downloads/mes (reintentos + visualización) = **$0.0008/mes**

### Egress (Salida de datos)
- **$0.00** ✅ - Sin cargos por descarga

### Total estimado
- **~$0.15/mes** para 30 batches de 700 PDFs + visualización ilimitada
- **Escalable**: El costo crece linealmente con el uso

## Visualización de PDFs

Una vez configurado R2, cada factura mostrará un botón **"Ver PDF"** en la página de detalles:

```
[< Volver a Facturas]           [Ver PDF 🔗] [DESCUADRE] [Editar]
```

El botón:
- Abre el PDF en una nueva pestaña
- Usa la URL almacenada en la base de datos
- Funciona con URLs públicas o dominio personalizado
- No requiere autenticación adicional

## Monitoreo

Puedes ver la actividad del sistema en los logs:

```
[processBatchInBackground] R2 configured, uploading PDFs for permanent storage
[processBatchInBackground] Uploaded 700 PDFs to R2 for permanent storage
[Retry] Descuadre detectado en FAC-2024-001, verificando si es posible reintentar...
[Retry] Intento 2/4 para FAC-2024-001...
[Retry] ✓ Éxito en intento 2 para FAC-2024-001
Note: PDFs are now stored permanently in R2 for viewing in the UI
```

En la base de datos:
- `Invoice.pdfUrl`: URL del PDF en R2
- `BatchProcessing.r2Keys`: Array de keys para debugging
- `BatchProcessing.retryAttempts`: Total de reintentos realizados
- `BatchProcessing.retriedFiles`: Archivos reintentados

## Seguridad

### Acceso público vs. privado

**Opción 1: Bucket público** (configuración actual)
- ✅ Fácil de configurar
- ✅ Sin necesidad de signed URLs
- ✅ URLs permanentes y simples
- ⚠️ Cualquiera con la URL puede ver el PDF
- 💡 Recomendado si los PDFs no contienen información sensible

**Opción 2: Bucket privado con signed URLs**
- ✅ Mayor seguridad
- ✅ URLs expiran después de X tiempo
- ❌ Requiere generar signed URLs dinámicamente
- ❌ Más complejo de implementar
- 💡 Recomendado para información sensible

Para implementar signed URLs, modifica `getPdfUrlFromKey()` en `lib/storage/r2-client.ts`.

## Documentación Completa

Ver [INVOICE_RETRY_SYSTEM.md](./INVOICE_RETRY_SYSTEM.md) para detalles técnicos completos.
