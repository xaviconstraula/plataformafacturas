# Sistema de Reintentos Automáticos para Facturas (Modo Batch)

## Descripción General

El sistema implementa procesamiento asíncrono de facturas mediante la API de Batch de Gemini. Actualmente, **solo se utiliza el modo batch** para procesar facturas, no hay modo directo/inmediato.

##Limitación Actual: Reintentos en Modo Batch

En el modo batch de Gemini:

- Los PDFs se envían a Gemini Batch API y se procesan de forma completamente asíncrona
- Los resultados se reciben vía webhook cuando Gemini termina de procesarlos
- **No es posible reintentar automáticamente** cuando se detectan descuadres porque:
  - No tenemos acceso a los PDFs originales cuando llegan los resultados
  - El procesamiento ya finalizó en Gemini
  - Reintentar requeriría crear un nuevo job batch completo

### Detección de Descuadres

La función `evaluateTotalsMismatch` compara:
- **Suma de líneas**: Base imponible (suma de `totalPrice` de todos los items)
- **Total esperado**: Base imponible + IVA - Retención
- **Total extraído**: El importe total que extrae la IA del PDF

Si la diferencia supera la tolerancia (0.50€ por defecto), se marca como `hasTotalsMismatch`.

### Manejo Actual

Cuando se detecta un descuadre:
1. La factura se guarda con el flag `hasTotalsMismatch = true`
2. Se genera un error de validación que se muestra al usuario
3. Se requiere **revisión manual** de la factura en la interfaz

## Flujo de Procesamiento Batch

### 1. Inicio del Batch
```typescript
startInvoiceBatch(formData) →
  processBatchInBackground(files, userId)
```

### 2. Preparación
- Se construyen chunks JSONL con los PDFs codificados en base64
- Cada chunk se sube a Gemini Files API
- Se crea un job batch en Gemini por cada chunk

### 3. Procesamiento Asíncrono
- Gemini procesa todos los PDFs en paralelo
- El estado se actualiza periódicamente
- La UI se actualiza mediante polling de TanStack Query

### 4. Recepción de Resultados
```typescript
ingestBatchOutputFromGemini(batchId, dest) →
  processOutputLines(entries) →
    saveExtractedInvoice(data)
```

### 5. Detección de Descuadres
En `processOutputLines`:
```typescript
const result = await saveExtractedInvoice(extractedData, key);

// 🔄 Retry logic placeholder (currently disabled)
if (result.hasTotalsMismatch) {
    // Cannot retry in batch mode - PDF not available
    console.warn(`Mismatch detected for ${key}. Manual review required.`);
}
```

## Archivos Involucrados

### Funciones Principales

- **`startInvoiceBatch()`**: Punto de entrada, crea el batch y lo encola
- **`processBatchInBackground()`**: Construye y sube los jobs a Gemini
- **`ingestBatchOutputFromGemini()`**: Procesa resultados del webhook
- **`processOutputLines()`**: Parsea y guarda cada factura individual
- **`saveExtractedInvoice()`**: Guarda la factura en la base de datos
- **`evaluateTotalsMismatch()`**: Detecta descuadres

### Prompts

El prompt de extracción incluye instrucciones detalladas sobre:
- Formato de salida basado en texto (no JSON)
- Cálculo de descuentos secuenciales
- Extracción de IVA y retenciones
- Validación de totales

# Sistema de Reintentos con Cloudflare R2 - Implementado ✅

## Estado: IMPLEMENTADO

El sistema de reintentos automáticos con Cloudflare R2 ha sido implementado completamente.

## Características Implementadas

### ✅ Almacenamiento en R2
- PDFs se suben a Cloudflare R2 antes de enviar al batch de Gemini
- Keys organizadas por `batchId/filename.pdf`
- Metadata incluye: `uploadedAt`, `expiresAt`, `batchId`

### ✅ Sistema de Reintentos Automático
- Detecta descuadres de totales usando `evaluateTotalsMismatch()`
- Hasta 3 reintentos adicionales (intentos 2, 3, 4)
- Descarga PDF desde R2 y reextrae automáticamente
- Exponential backoff entre intentos (1s, 2s, 3s)
- Actualiza estadísticas: `retryAttempts`, `retriedFiles`

### ✅ Limpieza Automática
- Archivos R2 se eliminan cuando el batch se completa
- Lifecycle policy en R2 elimina archivos > 24h (failsafe)

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario sube PDFs                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. processBatchInBackground()                               │
│    - Sube PDFs a R2 (si está configurado)                  │
│    - Guarda r2Keys en BatchProcessing                      │
│    - Crea batch en Gemini                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Gemini procesa batch (asíncrono)                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ingestBatchOutputFromGemini() - Webhook                 │
│    - Procesa resultados                                    │
│    - Si detecta descuadre:                                 │
│      → Descarga PDF desde R2                               │
│      → Reextrae hasta 3 veces                              │
│      → Guarda resultado exitoso o marca error              │
│    - Limpia archivos R2 al terminar                        │
└─────────────────────────────────────────────────────────────┘
```

## Flujo de Reintentos

```typescript
// Detección de descuadre
if (result.hasTotalsMismatch && !result.success) {
  // Buscar PDF en R2
  const r2Keys = batch.r2Keys;
  const pdfKey = r2Keys.find(k => k.endsWith(fileName));
  
  // Hasta 3 reintentos adicionales
  for (let attempt = 2; attempt <= 4; attempt++) {
    const retryFile = await downloadPdfFromR2(pdfKey);
    const retryExtraction = await callPdfExtractAPI(retryFile, []);
    const retryResult = await saveExtractedInvoice(retryExtraction.extractedData);
    
    if (retryResult.success && !retryResult.hasTotalsMismatch) {
      // ✅ Éxito - actualizar estadísticas y salir
      break;
    }
    
    // Esperar antes del siguiente intento (1s, 2s, 3s)
    await sleep(1000 * attempt);
  }
}
```

## Configuración

### 1. Crear Bucket en Cloudflare R2

```bash
# En Cloudflare Dashboard:
# 1. Ve a R2 Object Storage
# 2. Crea bucket "invoice-retries"
# 3. Genera API tokens (Read & Write)
```

### 2. Variables de Entorno

```env
# .env
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=invoice-retries
```

### 3. Lifecycle Policy (Opcional pero Recomendado)

En Cloudflare Dashboard, configura lifecycle policy:
- **Eliminar objetos después de**: 24 horas
- **Aplicar a**: Todo el bucket

Esto asegura que archivos huérfanos se eliminen automáticamente.

## Costos Estimados

Para 700 PDFs (~3.5 GB) durante 24 horas:

| Concepto | Costo |
|----------|-------|
| Almacenamiento (3.5 GB × 1 día) | $0.0014 |
| Operaciones Class A (700 uploads) | $0.0035 |
| Operaciones Class B (max 2100 downloads) | $0.0021 |
| **Total por batch** | **~$0.007** |
| Egress (salida de datos) | **$0.00** ✅ |

**~$0.21/mes** para 30 batches de 700 PDFs cada uno.

## Ventajas de R2

✅ **Sin egress fees** - descargar PDFs es gratis
✅ **Lifecycle policies** - limpieza automática
✅ **Compatible S3** - SDK estándar
✅ **Económico** - ~$0.007 por batch
✅ **Global** - baja latencia desde cualquier región

## Monitoreo

Los logs incluyen información del sistema de reintentos:

```
[processBatchInBackground] R2 configured, uploading PDFs for retry capability
[processBatchInBackground] Uploaded 700 PDFs to R2
[Retry] Descuadre detectado en FAC-2024-001, verificando si es posible reintentar...
[Retry] Intento 2/4 para FAC-2024-001...
[Retry] ✓ Éxito en intento 2 para FAC-2024-001
[R2 Cleanup] Eliminando 700 PDFs de R2 para batch xyz
[R2 Cleanup] Limpieza completada para batch xyz
```

Estadísticas disponibles en `BatchProcessing`:
- `retryAttempts`: Total de reintentos realizados
- `retriedFiles`: Número de archivos que fueron reintentados

## Fallback

Si R2 no está configurado:
- Sistema funciona normalmente sin reintentos
- Log: `[processBatchInBackground] R2 not configured, skipping PDF upload (no retry capability)`
- Facturas con descuadre se marcan con `hasTotalsMismatch` para revisión manual

## Archivos Creados/Modificados

- ✅ `lib/storage/r2-client.ts` - Cliente R2 con funciones de upload/download/cleanup
- ✅ `prisma/schema.prisma` - Campos `r2Keys`, `retryAttempts`, `retriedFiles` en `BatchProcessing`
- ✅ `lib/actions/invoices.ts` - Integración completa de reintentos
- ✅ `.env.example` - Variables de configuración documentadas

## Testing

### Sin R2 (comportamiento actual)
```bash
# Sin configurar R2, el sistema funciona sin reintentos
npm run dev
```

### Con R2
```bash
# 1. Configurar variables de entorno
# 2. Subir facturas con errores de totales
# 3. Verificar logs de reintentos
# 4. Confirmar que archivos se eliminan de R2
```

## Próximos Pasos

1. ✅ Configurar cuenta Cloudflare R2
2. ✅ Crear bucket "invoice-retries"  
3. ✅ Generar API tokens
4. ✅ Añadir variables al `.env`
5. ✅ Probar con batch de facturas
6. ✅ Configurar lifecycle policy (24h)
7. ✅ Monitorear costos y performance

## Consideraciones

### Espacio en Disco
- Batches grandes (700 archivos × 5MB promedio = 3.5GB)
- Necesidad de limpieza activa para evitar llenar el disco

### Memoria
- PDFs grandes pueden causar problemas de memoria
- Límite de 700 archivos por batch para controlar uso de recursos

### Latencia
- Cada reintento añade ~30 segundos de procesamiento
- 4 reintentos = hasta 2 minutos adicionales por factura problemática

### Complejidad
- Sistema de almacenamiento temporal robusto
- Manejo de fallos durante reintentos
- Sincronización entre webhook y reintentos

## Configuración Actual

```typescript
// Límites de batch
const MAX_FILES_PER_UPLOAD = 700;
const MAX_BATCH_FILE_SIZE = 90 * 1024 * 1024; // 90 MB por chunk

// Tolerancia de descuadre
const DEFAULT_MISMATCH_TOLERANCE = 0.5; // 0.50€

// Modelo utilizado
const GEMINI_MODEL = "gemini-2.5-flash";
```

## Monitoreo

### Ver estado de batches

```typescript
const batches = await getActiveBatches();
// Muestra PENDING, PROCESSING, COMPLETED, FAILED
```

### Ver errores

```typescript
const batch = await getBatchById(batchId);
console.log(batch.errors); // Array de BatchErrorDetail
```

### Ver descuadres

Las facturas con `hasTotalsMismatch = true` se pueden consultar:

```sql
SELECT * FROM "Invoice" WHERE "hasTotalsMismatch" = true;
```

## Conclusión

El sistema actual procesa facturas de manera eficiente mediante batch processing asíncrono, pero no implementa reintentos automáticos para facturas con descuadres. 

Las facturas problemáticas se marcan para revisión manual, lo cual es un compromiso razonable considerando:
- La complejidad de implementar reintentos en modo asíncrono
- Los requisitos de almacenamiento temporal
- La mayoría de facturas se procesan correctamente en el primer intento

Para casos críticos donde los reintentos sean esenciales, se podría implementar una de las opciones híbridas descritas anteriormente.

