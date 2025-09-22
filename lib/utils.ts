import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatPercentage(percentage: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(percentage / 100)
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat("es-ES", {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(dateObj)
}

export function getQuarterFromMonth(month: number): number {
  return Math.ceil(month / 3)
}

export function getMonthName(month: number): string {
  const date = new Date()
  date.setMonth(month - 1)
  return date.toLocaleString("es-ES", { month: "long" })
}

export function getQuarterName(quarter: number): string {
  return `Q${quarter}`
}

/**
 * Extrae códigos de referencia de manera simple y flexible
 * Solo busca patrones muy básicos que indiquen códigos
 */
export function extractMaterialCode(materialName: string, description?: string): string | null {
  const text = `${materialName} ${description || ''}`.trim();

  // Solo buscar patrones muy obvios que indiquen códigos de referencia
  const obviousPatterns = [
    // Códigos con prefijos claros
    /\b(REF[-_\.:\s]*[A-Z0-9]+)\b/gi,      // REF123, REF:ABC456, REF-XYZ789
    /\b(COD[-_\.:\s]*[A-Z0-9]+)\b/gi,      // COD123, COD:ABC456
    /\b(ART[-_\.:\s]*[A-Z0-9]+)\b/gi,      // ART123, ART:ABC456
    /\b(MAT[-_\.:\s]*[A-Z0-9]+)\b/gi,      // MAT123, MAT:ABC456
    /\b(SKU[-_\.:\s]*[A-Z0-9]+)\b/gi,      // SKU123, SKU:ABC456
  ];

  for (const pattern of obviousPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const code = matches[0].trim().toUpperCase();
      // Normalizar separadores
      const cleanCode = code.replace(/[-_\.:\s]+/g, '');

      if (cleanCode.length >= 4) { // Mínimo 4 caracteres para ser válido
        return cleanCode;
      }
    }
  }

  return null;
}

/**
 * Validación muy básica para códigos de material
 * Solo excluye casos obviamente inválidos
 */
function isValidMaterialCode(code: string): boolean {
  // Debe tener al menos 3 caracteres
  if (code.length < 3) {
    return false;
  }

  // Excluir solo patrones muy obvios de fechas
  if (/^20\d{6}$/.test(code)) {  // 20241225
    return false;
  }

  return true;
}

/**
 * Normaliza un código de material para comparación
 */
export function normalizeMaterialCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[-_\.:\s]/g, '') // Remover separadores
    .trim();
}

/**
 * Compara dos códigos de material para ver si son similares
 * Enfoque simplificado que confía más en la extracción del PDF
 */
export function areMaterialCodesSimilar(code1: string, code2: string): boolean {
  if (!code1 || !code2) return false;

  const normalized1 = normalizeMaterialCode(code1);
  const normalized2 = normalizeMaterialCode(code2);

  // Coincidencia exacta después de normalización
  if (normalized1 === normalized2) return true;

  // Solo hacer comparación parcial si ambos códigos son suficientemente largos
  // y no queremos ser demasiado agresivos
  if (normalized1.length >= 6 && normalized2.length >= 6) {
    // Si uno contiene completamente al otro
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
  }

  return false;
}

/**
 * Genera un código de material estándar basado en el nombre y código extraído
 */
export function generateStandardMaterialCode(materialName: string, extractedCode?: string): string {
  if (extractedCode && isValidMaterialCode(extractedCode)) {
    return normalizeMaterialCode(extractedCode);
  }

  // Generar código basado en el nombre
  const baseName = materialName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s]/g, '')     // Remover caracteres especiales
    .replace(/\s+/g, '-')            // Reemplazar espacios con guiones
    .substring(0, 45);               // Limitar longitud

  return baseName;
}

/**
 * Normaliza un nombre de material para comparación
 */
export function normalizeMaterialName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s]/g, '')     // Remover caracteres especiales excepto espacios
    .replace(/\s+/g, ' ')            // Normalizar espacios múltiples
    .trim();
}

/**
 * Compara dos nombres de material para ver si son similares
 * Considera tanto el ID del material como el nombre para detectar duplicados
 */
export function areMaterialNamesSimilar(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;

  const normalized1 = normalizeMaterialName(name1);
  const normalized2 = normalizeMaterialName(name2);

  // Coincidencia exacta
  if (normalized1 === normalized2) return true;

  // Coincidencia parcial (uno contiene al otro) para nombres largos
  if (normalized1.length >= 6 && normalized2.length >= 6) {
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
  }

  // Verificar si las palabras clave coinciden (para casos como "Tubo PVC 110mm" vs "PVC Tubo 110")
  const words1 = normalized1.split(' ').filter(word => word.length > 2);
  const words2 = normalized2.split(' ').filter(word => word.length > 2);

  if (words1.length >= 2 && words2.length >= 2) {
    const commonWords = words1.filter(word => words2.includes(word));
    // Si comparten al menos 2 palabras significativas, considerarlos similares
    if (commonWords.length >= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes search terms for consistent filtering
 * Trims whitespace and converts to lowercase for case-insensitive searches
 */
export function normalizeSearch(searchTerm: string | undefined | null): string | undefined {
  if (!searchTerm) return undefined;

  const trimmed = searchTerm.trim();
  return trimmed === '' ? undefined : trimmed.toLowerCase();
}

/**
 * Processes work order search terms by normalizing and replacing spaces with dashes
 */
export function processWorkOrderSearch(workOrder: string | undefined | null): string | undefined {
  if (!workOrder) return undefined;

  const normalized = normalizeSearch(workOrder);
  return normalized ? normalized.replace(/\s+/g, '-') : undefined;
}

/**
 * Normalize a CIF/NIF/NIE for robust comparison:
 * - Uppercase
 * - Strip country prefix (ES, with optional separators)
 * - Remove all non-alphanumeric characters
 */
export function normalizeCifForComparison(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const upper = String(raw).toUpperCase().trim();
  // Remove ES prefix with optional separators (e.g., ES, ES-, ES , ES:)
  const withoutCountry = upper.replace(/^ES[\s\-_.:]?/i, '');
  const normalized = withoutCountry.replace(/[^A-Z0-9]/g, '');
  return normalized || undefined;
}

/**
 * Build a small set of likely CIF/NIF/NIE variants that might exist in DB
 * to allow resilient matching (handles hyphens and ES prefix).
 */
export function buildCifVariants(input: string | undefined | null): string[] {
  const variants = new Set<string>();
  if (!input) return [];

  const rawUpper = String(input).toUpperCase().trim();
  const core = normalizeCifForComparison(rawUpper);
  if (!core) return [rawUpper];

  variants.add(rawUpper);
  variants.add(core);

  // CIF: Letter + 8 digits, e.g., A12345678
  const cifPattern = /^[A-Z][0-9]{8}$/;
  // NIF: 8 digits + Letter, e.g., 12345678A
  const nifPattern = /^[0-9]{8}[A-Z]$/;
  // NIE: X/Y/Z + 7 digits + Letter, e.g., X1234567A
  const niePattern = /^[XYZ][0-9]{7}[A-Z]$/;

  if (cifPattern.test(core)) {
    const withHyphen = `${core[0]}-${core.substring(1)}`;
    variants.add(withHyphen);
    variants.add(`ES${core}`);
    variants.add(`ES-${withHyphen}`);
    variants.add(`ES ${core}`);
  } else if (nifPattern.test(core)) {
    const withHyphen = `${core.substring(0, 8)}-${core[8]}`;
    variants.add(withHyphen);
    variants.add(`ES${core}`);
    variants.add(`ES-${withHyphen}`);
    variants.add(`ES ${core}`);
  } else if (niePattern.test(core)) {
    const withHyphen = `${core[0]}-${core.substring(1, 8)}-${core[8]}`;
    variants.add(withHyphen);
    variants.add(`ES${core}`);
    variants.add(`ES-${withHyphen}`);
    variants.add(`ES ${core}`);
  } else {
    // Generic fallbacks
    variants.add(`ES${core}`);
    variants.add(`ES-${core}`);
    variants.add(`ES ${core}`);
  }

  return Array.from(variants);
}
