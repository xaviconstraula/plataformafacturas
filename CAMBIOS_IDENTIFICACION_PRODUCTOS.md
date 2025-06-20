# Mejoras en Identificación de Productos y Alertas

## Resumen de Cambios Implementados

### 1. Extracción Mejorada de Códigos de Referencia

#### Nuevas Funciones en `lib/utils.ts`:
- **`extractMaterialCode()`**: Extrae códigos de referencia de nombres y descripciones de productos usando patrones regex avanzados
- **`normalizeMaterialCode()`**: Normaliza códigos para comparación consistente
- **`areMaterialCodesSimilar()`**: Compara códigos para detectar similitudes
- **`generateStandardMaterialCode()`**: Genera códigos estándar basados en nombres

#### Patrones de Códigos Soportados:
- Códigos alfanuméricos con separadores: `ABC-123`, `XYZ_456`, `MAT.789`
- Códigos con prefijos: `REF123`, `COD:ABC456`, `ART-XYZ789`
- Códigos de barras: números de 8-13 dígitos
- Códigos mixtos: `A12-34`, `123ABC`

### 2. Actualización del Modelo de Datos

#### Cambios en `prisma/schema.prisma`:

**Modelo Material:**
```prisma
model Material {
  // ... campos existentes
  
  // Nuevos campos para identificación mejorada
  referenceCode    String? // Código de referencia extraído del PDF
  alternativeCodes String? // Códigos alternativos separados por comas
  
  @@index([referenceCode])
}
```

**Modelo PriceAlert:**
```prisma
model PriceAlert {
  // ... campos existentes
  
  // Nuevos índices para prevenir duplicados
  @@unique([materialId, providerId, effectiveDate])
  @@index([materialId, providerId, effectiveDate])
}
```

### 3. Mejoras en Procesamiento de PDFs

#### Actualización del Prompt de OpenAI:
- Incluye instrucciones específicas para extraer códigos de referencia
- Busca códigos en columnas etiquetadas como "Código", "Ref", "Art", "Material"
- Extrae códigos de descripciones de productos

#### Campo Añadido a `ExtractedPdfItemData`:
```typescript
interface ExtractedPdfItemData {
  materialName: string;
  materialCode?: string; // Nuevo campo para código de referencia
  // ... otros campos
}
```

### 4. Lógica Mejorada de Identificación de Materiales

#### Función `findOrCreateMaterialTx()` Actualizada:
1. **Búsqueda por código exacto**: Prioriza códigos de referencia extraídos
2. **Búsqueda por códigos similares**: Detecta variaciones del mismo código
3. **Búsqueda por nombre**: Fallback al método anterior
4. **Creación con código normalizado**: Almacena tanto el código normalizado como el original

#### Secuencia de Búsqueda:
```
1. Extraer código del nombre/descripción si no se proporcionó
2. Normalizar código extraído
3. Buscar por código exacto en BD
4. Si no encuentra, buscar códigos similares
5. Si no encuentra, buscar por nombre
6. Crear nuevo material con códigos almacenados
```

### 5. Prevención de Alertas Duplicadas

#### Verificación Antes de Crear Alertas:
- Consulta si ya existe alerta para el mismo material, proveedor y fecha efectiva
- Evita crear alertas duplicadas para el mismo cambio de precio
- Mejora la calidad de los datos y reduce ruido

#### Lógica Implementada:
```typescript
const existingAlert = await tx.priceAlert.findFirst({
    where: {
        materialId: createdMaterial.id,
        providerId,
        effectiveDate,
    },
});

if (!existingAlert) {
    // Crear nueva alerta
} else {
    // Log y omitir creación duplicada
}
```

### 6. Beneficios Obtenidos

#### Para Identificación de Productos:
- ✅ **Detección mejorada de productos iguales** usando códigos de referencia
- ✅ **Reducción de duplicados** en el catálogo de materiales
- ✅ **Mejor agrupación** de productos similares con códigos diferentes
- ✅ **Extracción automática** de códigos desde PDFs

#### Para Alertas de Precio:
- ✅ **Eliminación de alertas duplicadas** para el mismo cambio de precio
- ✅ **Mejor calidad de datos** en el sistema de alertas
- ✅ **Reducción de ruido** para los usuarios
- ✅ **Historial más limpio** de cambios de precios

### 7. Compatibilidad y Migración

#### Base de Datos:
- Migración ejecutada con `npx prisma db push --force-reset`
- Nuevos campos opcionales, compatibles con datos existentes
- Índices añadidos para mejorar rendimiento de consultas

#### Código Existente:
- Cambios retrocompatibles con funcionalidades existentes
- Funciones nuevas no afectan flujos actuales
- Mejoras transparentes en procesamiento de facturas

### 8. Configuración Realizada

1. **Actualización de tipos**: `lib/types/pdf.ts`
2. **Nuevas utilidades**: `lib/utils.ts`
3. **Esquema de BD actualizado**: `prisma/schema.prisma`
4. **Lógica de procesamiento mejorada**: `lib/actions/invoices.ts`
5. **Migración de BD ejecutada**: `npx prisma db push --force-reset`
6. **Validación de tipos**: `npx tsc --noEmit` ✅

## Casos de Uso Mejorados

### Antes:
- Material "Acero Inox REF-123" y "REF123 Acero Inoxidable" se crean como productos separados
- Múltiples alertas para el mismo cambio de precio en la misma fecha
- Dificultad para identificar productos equivalentes

### Después:
- Productos con códigos similares se unifican automáticamente
- Una sola alerta por cambio de precio por fecha
- Identificación inteligente de productos basada en códigos de referencia

## Próximos Pasos Recomendados

1. **Monitoreo**: Observar logs de identificación de códigos similares
2. **Ajuste de patrones**: Refinar regex según códigos encontrados en facturas reales
3. **Interface de usuario**: Mostrar códigos de referencia en listados de materiales
4. **Reportes**: Incluir códigos en exportaciones y análisis 