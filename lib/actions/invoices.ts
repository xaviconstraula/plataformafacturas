'use server'

import { prisma } from "@/lib/db";
import { type ExtractedPdfData, type ExtractedPdfItemData } from "@/lib/types/pdf";
import { Prisma, type Provider, type Material, type Invoice, type InvoiceItem, type PriceAlert, type MaterialProvider, BatchStatus } from "@/generated/prisma";
import { groupBatchesByTimeWindow as groupBatchesUtil } from "@/lib/utils/batch-grouping";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { normalizeMaterialCode, areMaterialCodesSimilar, normalizeCifForComparison, buildCifVariants } from "@/lib/utils";
import { parseJsonLinesFromFile } from "@/lib/utils/jsonl-parser";
import { requireAuth } from "@/lib/auth-utils";
import { uploadPdfToR2, downloadPdfFromR2, isR2Configured, getPdfUrlFromKey } from '@/lib/storage/r2-client';
import fs from "fs";
import path from "path";
import os from "os";
// ------------------------------
// Upload constraints & utilities
// ------------------------------
const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = ["application/pdf"] as const;
const MAX_FILES_PER_UPLOAD = 700;
const MAX_TOTAL_UPLOAD_BYTES = 700 * 1024 * 1024; // 500 MB per request

function validateUploadFile(file: File): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return { valid: false, error: `File is not a PDF.` };
    }
    if (typeof file.size === 'number' && file.size > MAX_UPLOAD_FILE_SIZE) {
        return { valid: false, error: `File exceeds ${Math.round(MAX_UPLOAD_FILE_SIZE / 1024 / 1024)}MB limit.` };
    }
    if (typeof file.size === 'number' && file.size === 0) {
        return { valid: false, error: `File is empty.` };
    }
    return { valid: true };
}

function isRateLimitError(error: unknown): boolean {
    const e = error as { status?: number; error?: { code?: number }; message?: string } | undefined;
    if (!e) return false;
    if (e.status === 429 || e.error?.code === 429) return true;
    if (typeof e.message === 'string') {
        const m = e.message.toLowerCase();
        if (m.includes('rate limit') || m.includes('quota exceeded')) return true;
    }
    return false;
}

function parseJsonSafe(rawInput: string): unknown {
    if (!rawInput) return null;
    let raw = rawInput.trim();
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
    }
    raw = raw.replace(/[\uFEFF\u200B-\u200D]/g, '');

    // Handle double-escaped JSON from Gemini batch responses
    if (raw.startsWith('{\\')) {
        raw = raw
            .replace(/\\\\/g, '\x00')      // Temporarily replace \\\\ with placeholder
            .replace(/\\"/g, '"')          // Unescape quotes
            .replace(/\\\//g, '/')         // Unescape forward slashes
            .replace(/\\b/g, '\b')         // Unescape backspace
            .replace(/\\f/g, '\f')         // Unescape form feed
            .replace(/\\n/g, '\n')         // Unescape newlines
            .replace(/\\r/g, '\r')         // Unescape carriage returns
            .replace(/\\t/g, '\t')         // Unescape tabs
            .replace(/\x00/g, '\\');       // Replace placeholder with actual backslash
    }

    // Replace potential comma decimals (e.g., 1,23 -> 1.23) to handle locale issues
    raw = raw.replace(/(\d+),(\d+)/g, '$1.$2');

    // New: Remove trailing commas before } or ]
    raw = raw.replace(/,\s*([}\]])/g, '$1');

    try { return JSON.parse(raw); } catch (e) {
        console.error('[parseJsonSafe] JSON.parse failed with error:', (e as SyntaxError).message, 'Raw input preview:', raw.substring(0, 500));
    }

    // Handle case where the content itself is a JSON string literal
    try {
        if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
            const onceDecoded = JSON.parse(raw) as string;
            try { return JSON.parse(onceDecoded); } catch { return onceDecoded; }
        }
    } catch { }

    // Extra robust fallback: decode escape sequences by parsing as a JSON string first,
    // then parse the decoded result as JSON.
    try {
        const quoted = '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        const decoded = JSON.parse(quoted) as string;
        return JSON.parse(decoded);
    } catch { }

    // Fallback: try to extract JSON object if possible
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        const slice = raw.slice(start, end + 1);
        try { return JSON.parse(slice); } catch { }
    }

    // Post-parse fix for "null" strings and other string literals (convert to appropriate types)
    function fixNullStrings(obj: unknown): unknown {
        if (obj === 'null') return null;
        if (obj === 'true') return true;
        if (obj === 'false') return false;
        if (typeof obj === 'object' && obj !== null) {
            const record = obj as Record<string, unknown>;
            for (const key in record) {
                record[key] = fixNullStrings(record[key]);
            }
        }
        return obj;
    }

    try {
        const parsed = JSON.parse(raw);
        return fixNullStrings(parsed);
    } catch { }

    return null;
}

function isExtractedPdfData(value: unknown): value is ExtractedPdfData {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    const provider = v.provider as Record<string, unknown> | undefined;
    const items = v.items as unknown[] | undefined;
    return typeof v.invoiceCode === 'string'
        && provider !== undefined
        && typeof provider.name === 'string'
        && typeof v.issueDate === 'string'
        && typeof v.totalAmount === 'number'
        && Array.isArray(items);
}

// Represents the minimal part of the ChatCompletion response we need when
// reading a Batch output file. Only the assistant message content is required.
interface ChatCompletionBody {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

// Gemini configuration
const GEMINI_MODEL = "gemini-3-flash-preview";

// Regex helpers used to keep Gemini outputs constrained and avoid noisy payloads
const CIF_REGEX = "^(?:ES)?[A-Z0-9][A-Z0-9\\-]{5,15}$";
const ISO_DATE_REGEX = "^\\d{4}-\\d{2}-\\d{2}$";
const PHONE_REGEX = "^(?:\\+?\\d{9,15})$";
const WORK_ORDER_REGEX = "^(?:OT-)?[0-9A-Za-z]{3,12}$";

// Text-based format configuration
// Using pipe (|) as primary delimiter and semicolon (;) for nested data
// This reduces token usage by 60-70% compared to JSON schema
const TEXT_FORMAT_DELIMITER = '|';
const TEXT_FORMAT_NESTED_DELIMITER = ';';

/**
 * Validate and fix common date format errors from AI extraction.
 * Handles cases where AI outputs YYYY-DD-MM instead of YYYY-MM-DD.
 * 
 * @param dateStr - The date string to validate and potentially fix
 * @returns A valid date string in YYYY-MM-DD format, or the original if it's already valid
 * 
 * Examples:
 * - "2024-31-12" → "2024-12-31" (fixes reversed day/month)
 * - "2024-12-31" → "2024-12-31" (already valid, no change)
 * - "2024-02-30" → "2024-02-30" (invalid but can't auto-fix ambiguous cases)
 */
function validateAndFixDate(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string') {
        return dateStr;
    }

    // Check if it's in YYYY-MM-DD or YYYY-DD-MM format
    const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = dateStr.match(datePattern);

    if (!match) {
        // Not in expected format, return as-is
        return dateStr;
    }

    const [, year, middle, end] = match;
    const yearNum = parseInt(year, 10);
    const middleNum = parseInt(middle, 10);
    const endNum = parseInt(end, 10);

    // Try to parse as YYYY-MM-DD first
    const asIsDate = new Date(`${year}-${middle}-${end}`);
    const isValid = !isNaN(asIsDate.getTime());

    // If the date is valid as-is, return it
    if (isValid && asIsDate.getFullYear() === yearNum &&
        (asIsDate.getMonth() + 1) === middleNum &&
        asIsDate.getDate() === endNum) {
        return dateStr;
    }

    // If middle > 12, it's clearly the day (YYYY-DD-MM format)
    if (middleNum > 12 && endNum >= 1 && endNum <= 12) {
        const correctedDate = `${year}-${end.padStart(2, '0')}-${middle.padStart(2, '0')}`;
        const testDate = new Date(correctedDate);

        // Verify the corrected date is valid
        if (!isNaN(testDate.getTime()) &&
            testDate.getFullYear() === yearNum &&
            (testDate.getMonth() + 1) === endNum &&
            testDate.getDate() === middleNum) {
            console.warn(`[Date Fix] Corrected malformed date: "${dateStr}" → "${correctedDate}"`);
            return correctedDate;
        }
    }

    // If end > 12, it might be in YYYY-MM-DD but with day > 12, which is valid
    // Or if both middle and end are <= 12, we can't determine which is month/day
    // In ambiguous cases, try to parse and if it fails, log a warning
    if (!isValid) {
        console.error(`[Date Validation] Invalid date detected: "${dateStr}". Cannot automatically fix ambiguous date.`);
    }

    return dateStr;
}

function calculateCombinedDiscount(discountRaw: string): number {
    const trimmed = discountRaw.trim();
    if (!trimmed || trimmed === '~' || trimmed.toLowerCase() === 'neto') {
        return 0;
    }

    // Extract all numbers from the string (handles "50 5", "50+5", "50-5", etc.)
    const discounts = trimmed.split(/[\s+\-,;]+/).map(d => parseFloat(d)).filter(d => !isNaN(d) && d > 0);

    if (discounts.length === 0) {
        return 0;
    }

    if (discounts.length === 1) {
        return Math.min(discounts[0], 100); // Cap at 100%
    }

    // Sequential discounts: multiply (1 - discount/100) for each
    let multiplier = 1;
    for (const discount of discounts) {
        multiplier *= (1 - Math.min(discount, 100) / 100);
    }

    // Combined discount percentage
    const combined = (1 - multiplier) * 100;
    return Number(combined.toFixed(2));
}

/**
 * Parse text-based invoice extraction response from Gemini
 * 
 * Format:
 * HEADER|invoiceCode|issueDate|totalAmount|workOrder (workOrder deprecated, use ~ here)
 * PROVIDER|name|cif|email|phone|address
 * ITEM|materialName|materialCode|isMaterial|quantity|discountRaw|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber
 * ITEM|...
 * 
 * Empty/null fields use: ~
 * discountRaw can be: "10" (single), "50 5" (sequential 50% then 5%), "NETO" (no discount)
 * Code calculates: discountPercentage (combined), listPrice = unitPrice / (1 - discount/100)
 * unitPrice: Extracted directly from PRECIO/PRECIO UNITARIO column (field 7). If missing, use 0.00 (no derivations).
 * workOrder: Specified per-item (field 9), NOT at invoice level (HEADER field 5 should be ~)
 * 
 * Example:
 * HEADER|FAC-2024-001|2024-01-15|1512.55|~
 * PROVIDER|ACME S.L.|A12345678|info@acme.com|+34912345678|Calle Principal 123, Madrid
 * ITEM|Cemento Portland|CEM001|true|10.00|50 5|25.50|255.00|~|OT-4077|Cemento gris 50kg|1
 * ITEM|Transporte|~|false|1.00|0|995.50|995.50|2024-01-15|OT-4077|Envío especial|2
 */
function parseTextBasedExtraction(text: string, options?: { suppressWarnings?: boolean }): ExtractedPdfData | null {
    const suppressWarnings = options?.suppressWarnings ?? false;
    const lines = text.trim().split('\n');

    let invoiceCode: string | undefined = undefined;
    let issueDate: string | undefined = undefined;
    let totalAmount: number | undefined = undefined;
    let ivaPercentage: number | undefined = undefined;
    let retentionAmount: number | undefined = undefined;
    let invoiceWorkOrder: string | undefined = undefined; // DEPRECATED: OT is now per-item, not invoice-level (kept for backward compatibility)
    let provider: ExtractedPdfData['provider'] | null = null;
    const items: ExtractedPdfItemData[] = [];

    const parseField = (value: string): string | undefined => {
        if (value === undefined || value === null) return undefined;
        const trimmed = value.trim();
        return trimmed === '~' || trimmed === '' ? undefined : trimmed;
    };

    const parseNumber = (value: string): number | undefined => {
        if (value === undefined || value === null) return undefined;
        const trimmed = value.trim();
        if (trimmed === '~' || trimmed === '') return undefined;

        // Handle Spanish negative notation: trailing dash means negative (e.g., "74,40-" → -74.40)
        let isNegative = false;
        let cleanedValue = trimmed;

        // Check for trailing dash (Spanish negative notation)
        if (cleanedValue.endsWith('-')) {
            isNegative = true;
            cleanedValue = cleanedValue.slice(0, -1).trim();
        }

        // Check for leading minus sign (standard notation)
        if (cleanedValue.startsWith('-')) {
            isNegative = true;
            cleanedValue = cleanedValue.slice(1).trim();
        }

        const num = parseFloat(cleanedValue);
        if (isNaN(num)) return undefined;

        // Apply negative sign if detected
        return isNegative ? -Math.abs(num) : Math.abs(num);
    };

    const parseBoolean = (value: string): boolean => {
        const trimmed = value.trim().toLowerCase();
        return trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue; // Skip empty lines and comments

        const parts = trimmedLine.split(TEXT_FORMAT_DELIMITER);
        const recordType = parts[0]?.toUpperCase();

        if (recordType === 'HEADER') {
            // HEADER|invoiceCode|issueDate|totalAmount|ivaPercentage|retentionAmount|workOrder (7 fields)
            if (parts.length < 4) {
                if (!suppressWarnings) console.warn(`Invalid HEADER line: ${trimmedLine}`);
                continue;
            }
            invoiceCode = parseField(parts[1]);
            const rawIssueDate = parseField(parts[2]);
            issueDate = rawIssueDate ? validateAndFixDate(rawIssueDate) : undefined;
            totalAmount = parseNumber(parts[3]);
            // Extract IVA percentage (field 4, required - default to 21% for Spain)
            ivaPercentage = parts.length >= 5 ? parseNumber(parts[4]) : 21.00;
            // Extract retention amount (field 5, required - default to 0)
            retentionAmount = parts.length >= 6 ? parseNumber(parts[5]) : 0.00;
            // Extract work order (OT) if present (field 6, optional)
            invoiceWorkOrder = parts.length >= 7 ? parseField(parts[6]) : undefined;
        } else if (recordType === 'PROVIDER') {
            // PROVIDER|name|cif|email|phone|address
            if (parts.length < 6) {
                if (!suppressWarnings) console.warn(`Invalid PROVIDER line: ${trimmedLine}`);
                continue;
            }
            provider = {
                name: parseField(parts[1]) || '',
                cif: parseField(parts[2]) || '',
                email: parseField(parts[3]),
                phone: parseField(parts[4]),
                address: parseField(parts[5])
            };
        } else if (recordType === 'ITEM') {
            // NEW FORMAT (11 fields + ITEM = 12 parts): ITEM|materialName|materialCode|isMaterial|quantity|discountRaw|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber
            // discountRaw can be: "10" (single discount), "50 5" (sequential 50% then 5%), "NETO" (no discount)
            // Code calculates: discountPercentage (combined), listPrice = unitPrice / (1 - discount/100)
            // unitPrice: Extracted directly from PRECIO/PRECIO UNITARIO column (field 7)
            // Accept 11-12 parts (lineNumber optional)
            if (parts.length < 11 || parts.length > 12) {
                if (!suppressWarnings) {
                    console.warn(`Malformed ITEM line (expected 11-12 parts, got ${parts.length}): ${trimmedLine}`);
                    console.warn(`Parts: ${parts.map((p, i) => `${i}:${p}`).join(', ')}`);
                    if (parts.length < 11) {
                        console.warn(`This likely indicates Gemini's response was truncated or missing required fields. Consider processing this invoice manually.`);
                    } else {
                        console.warn(`This indicates extra fields or parsing issues. Extra parts: ${parts.slice(12).join(', ')}`);
                    }
                }
                continue;
            }

            const materialName = parseField(parts[1]);
            let quantity = parseNumber(parts[4]);
            const discountRaw = parseField(parts[5]) || '0'; // Raw discount text (e.g., "50 5" or "10")
            let unitPrice = parseNumber(parts[6]); // Extracted unit price (field 7)
            let totalPrice = parseNumber(parts[7]); // Total price (field 8)

            // Parse remaining fields
            const rawItemDate = parseField(parts[8]);
            const itemWorkOrder = parseField(parts[9]); // Per-item work order (overrides invoice-level)
            const rawDescription = parseField(parts[10]);
            const rawLineNumber = parts.length === 12 ? parseNumber(parts[11]) : undefined;

            if (!materialName) {
                if (!suppressWarnings) console.warn(`Missing required ITEM fields: ${trimmedLine}`);
                continue;
            }

            // Simple defaults for required fields
            if (quantity === undefined || isNaN(quantity)) {
                quantity = 0; // Allow 0 but don't default to 1
            }
            if (unitPrice === undefined || isNaN(unitPrice)) {
                // Do not derive from other fields; extract as-is or default to 0.00
                unitPrice = 0;
            }
            if (totalPrice === undefined || isNaN(totalPrice)) {
                // Do not derive from other fields; extract as-is or default to 0.00
                totalPrice = 0;
            }

            // Calculate combined discount percentage from raw discount
            const discountPercentage = calculateCombinedDiscount(discountRaw);

            // Round to 3 decimal places to preserve precision
            quantity = Number(quantity.toFixed(3));
            unitPrice = Number(unitPrice.toFixed(3));
            totalPrice = Number(totalPrice.toFixed(3));

            // Calculate listPrice from extracted unitPrice
            // listPrice = unitPrice / (1 - discount/100) (handle 100% discount case)
            let listPrice = unitPrice; // Default to unitPrice if no discount
            if (discountPercentage > 0 && discountPercentage < 100) {
                listPrice = Number((unitPrice / (1 - discountPercentage / 100)).toFixed(3));
            } else if (discountPercentage === 100) {
                // For 100% discount, we can't calculate listPrice from unitPrice (would be division by zero)
                // Keep listPrice = unitPrice (both will be 0 if unitPrice is 0)
                listPrice = unitPrice;
            }

            items.push({
                materialName,
                materialCode: parseField(parts[2]),
                isMaterial: parseBoolean(parts[3] || 'true'),
                quantity,
                listPrice, // Calculated
                discountPercentage, // Calculated from discountRaw
                discountRaw, // Store raw discount text
                unitPrice, // Calculated
                totalPrice,
                itemDate: rawItemDate ? validateAndFixDate(rawItemDate) : undefined,
                workOrder: itemWorkOrder, // Per-item work order (no fallback to invoice-level anymore)
                description: rawDescription,
                lineNumber: rawLineNumber
            });
        }
    }

    // Validate required fields - be more descriptive about what's missing
    const validationErrors: string[] = [];
    if (!invoiceCode) validationErrors.push('invoiceCode missing');
    if (!provider) validationErrors.push('PROVIDER line missing');
    if (!issueDate) validationErrors.push('issueDate missing');
    if (totalAmount === undefined) validationErrors.push('totalAmount missing');
    if (items.length === 0) validationErrors.push('No ITEM lines found');

    if (validationErrors.length > 0) {
        if (!suppressWarnings) {
            console.error('Missing required fields in text extraction (possibly truncated Gemini response)', {
                hasInvoiceCode: !!invoiceCode,
                hasProvider: !!provider,
                hasIssueDate: !!issueDate,
                hasTotalAmount: totalAmount !== undefined,
                itemCount: items.length,
                errors: validationErrors,
                note: items.length === 0 ? 'No items extracted - likely output truncation' : undefined
            });
        }
        return null;
    }

    // 🚨 POST-VALIDATION: Check for credit note sign consistency
    // If totalAmount is negative (credit note), check if ALL items are incorrectly positive
    // Note: Mixed positive/negative items are valid (adjustments, discounts, etc.)
    if (totalAmount! < 0) {
        const itemsWithPositivePrices = items.filter(item => item.totalPrice > 0);
        const itemsWithNegativePrices = items.filter(item => item.totalPrice < 0);

        // Only auto-correct if ALL items are positive (clear extraction error)
        // If there's a mix, respect the extraction as-is (legitimate invoice with adjustments)
        if (itemsWithPositivePrices.length > 0 && itemsWithNegativePrices.length === 0 && !suppressWarnings) {
            const itemsSum = items.reduce((sum, item) => sum + item.totalPrice, 0);
            const expectedSum = totalAmount!; // Compare directly with extracted total (both include IVA)

            // Check if flipping all signs would make the math work
            const flippedSum = -itemsSum;
            const diffWithFlip = Math.abs(flippedSum - expectedSum);

            if (diffWithFlip < Math.abs(itemsSum - expectedSum)) {
                console.error(`⚠️ [Credit Note Sign Error] Invoice ${invoiceCode} has negative totalAmount (${totalAmount}) but ALL ${items.length} items are positive!`);
                console.error(`   Items sum: ${itemsSum.toFixed(2)}, Expected total: ${expectedSum.toFixed(2)}`);
                console.error(`   This indicates the AI failed to extract negative prices correctly.`);

                // Auto-correct: flip signs of all prices for credit notes
                console.warn(`   Auto-correcting: Converting all item prices to negative...`);
                for (const item of items) {
                    if (item.listPrice && item.listPrice > 0) item.listPrice = -item.listPrice;
                    if (item.unitPrice > 0) item.unitPrice = -item.unitPrice;
                    if (item.totalPrice > 0) item.totalPrice = -item.totalPrice;
                }
            } else {
                console.warn(`⚠️ [Credit Note Warning] Invoice ${invoiceCode} has negative totalAmount but positive items - keeping as-is (validation will check total)`);
            }
        }
    }    // Validate and calculate IVA/retention with intelligent fallback
    let finalIvaPercentage = ivaPercentage!;
    let finalRetentionAmount = retentionAmount!;

    // Calculate sum of line totals (already include IVA)
    const itemsSum = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

    // Expected relationship: sum(lineTotals) - retention = invoiceTotal
    const expectedTotal = itemsSum - finalRetentionAmount;
    const totalDifference = Math.abs(expectedTotal - totalAmount!);

    // If totals don't match within tolerance, try to fix retention
    if (totalDifference > 1) { // More than 1€ tolerance
        const calculatedRetention = itemsSum - totalAmount!;
        // Only adjust if calculated retention is reasonable (positive and not >50% of total)
        if (calculatedRetention >= 0 && calculatedRetention < itemsSum * 0.5) {
            finalRetentionAmount = Number(calculatedRetention.toFixed(2));
            console.log(`[IVA Validation] Adjusted retention from ${retentionAmount} to ${finalRetentionAmount} for invoice ${invoiceCode}`);
        }
    }

    // Validate IVA rate is reasonable (common Spanish rates: 0%, 4%, 10%, 21%)
    const validIvaRates = [0, 4, 10, 21];
    const roundedIva = Math.round(finalIvaPercentage);
    if (!validIvaRates.includes(roundedIva)) {
        // If extracted IVA is not a standard rate, default to 21%
        console.log(`[IVA Validation] IVA rate ${finalIvaPercentage}% is not standard, defaulting to 21.00% for invoice ${invoiceCode}`);
        finalIvaPercentage = 21.00;
    } else {
        // Use the exact valid rate
        finalIvaPercentage = roundedIva;
    }
    finalRetentionAmount = Number.isFinite(finalRetentionAmount) && finalRetentionAmount >= 0 ? finalRetentionAmount : 0.00;

    // At this point, all required fields are validated
    return {
        invoiceCode: invoiceCode!,
        provider: provider!,
        issueDate: issueDate!,
        totalAmount: totalAmount!,
        ivaPercentage: finalIvaPercentage,
        retentionAmount: finalRetentionAmount,
        items
    };
}

export interface BatchErrorDetail {
    kind: 'PARSING_ERROR' | 'DUPLICATE_INVOICE' | 'DATABASE_ERROR' | 'EXTRACTION_ERROR' | 'BLOCKED_PROVIDER' | 'VALIDATION_ERROR' | 'UNKNOWN';
    message: string;
    fileName?: string;
    invoiceCode?: string;
    timestamp: string;
}

// Type for batch processing records from database (with JSON errors field)
type BatchProcessingRecord = {
    id: string;
    status: BatchStatus;
    totalFiles: number;
    processedFiles: number;
    successfulFiles: number;
    failedFiles: number;
    blockedFiles: number;
    currentFile: string | null;
    estimatedCompletion: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    errors: unknown | null; // JSON field from database
}

// Type for error entries as stored in JSON
type JsonErrorEntry = {
    kind?: string;
    message?: unknown;
    fileName?: unknown;
    invoiceCode?: unknown;
    timestamp?: unknown;
}

const DEFAULT_MISMATCH_TOLERANCE = new Prisma.Decimal(0.5);
const euroCurrencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function decimalFrom(value: number | Prisma.Decimal | null | undefined): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Prisma.Decimal(value);
    }

    return new Prisma.Decimal(0);
}

export interface TotalsMismatchResult {
    hasMismatch: boolean;
    difference: Prisma.Decimal;
    itemsSum: Prisma.Decimal;
    expectedBase: Prisma.Decimal;
}

function evaluateTotalsMismatch(
    items: Array<{ totalPrice?: number | Prisma.Decimal | null }>,
    totalAmount: number | Prisma.Decimal,
    options?: { tolerance?: number; ivaPercentage?: number; retentionAmount?: number | Prisma.Decimal | null }
): TotalsMismatchResult {
    const tolerance = options?.tolerance !== undefined
        ? new Prisma.Decimal(options.tolerance)
        : DEFAULT_MISMATCH_TOLERANCE;

    // Line totals are the base imponible (before IVA)
    const baseImponible = items.reduce((acc, item) => acc.plus(decimalFrom(item.totalPrice)), new Prisma.Decimal(0));

    // Calculate IVA amount based on percentage
    const ivaPercentage = new Prisma.Decimal(options?.ivaPercentage ?? 21.00);
    const ivaAmount = baseImponible.times(ivaPercentage).dividedBy(100);

    // Calculate expected total: baseImponible + IVA - retention
    const retentionAmount = decimalFrom(options?.retentionAmount || 0);
    const expectedTotal = baseImponible.plus(ivaAmount).minus(retentionAmount);

    const totalAmountDecimal = decimalFrom(totalAmount);
    const difference = expectedTotal.minus(totalAmountDecimal).abs();

    return {
        hasMismatch: difference.greaterThan(tolerance),
        difference,
        itemsSum: expectedTotal, // Return the calculated total with IVA
        expectedBase: baseImponible, // Store base imponible for reference
    };
}

function buildTotalsMismatchMessage(invoiceCode: string, result: TotalsMismatchResult, totalAmount: number | Prisma.Decimal): string {
    const totalAmountDecimal = decimalFrom(totalAmount);
    return `Descuadre en factura ${invoiceCode}: suma de líneas ${euroCurrencyFormatter.format(Number(result.itemsSum.toFixed(2)))} frente a total extraído ${euroCurrencyFormatter.format(Number(totalAmountDecimal.toFixed(2)))}. Diferencia ${euroCurrencyFormatter.format(Number(result.difference.toFixed(2)))}.`;
}

export interface BatchProgressInfo {
    id: string;
    status: BatchStatus;
    totalFiles: number;
    processedFiles: number;
    successfulFiles: number;
    failedFiles: number;
    blockedFiles: number;
    currentFile?: string;
    estimatedCompletion?: Date;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    errors?: BatchErrorDetail[]; // Array of error messages with metadata
}

function pushBatchError(
    target: BatchErrorDetail[],
    detail: {
        kind?: BatchErrorDetail['kind'];
        message: string;
        fileName?: string;
        invoiceCode?: string;
        timestamp?: string;
    }
): void {
    target.push({
        kind: detail.kind ?? 'UNKNOWN',
        message: detail.message,
        fileName: detail.fileName,
        invoiceCode: detail.invoiceCode,
        timestamp: detail.timestamp ?? new Date().toISOString(),
    });
}

function serializeBatchErrors(errors: BatchErrorDetail[]): Prisma.InputJsonValue {
    return errors.map(error => ({
        kind: error.kind,
        message: error.message,
        fileName: error.fileName ?? null,
        invoiceCode: error.invoiceCode ?? null,
        timestamp: error.timestamp,
    })) as Prisma.InputJsonValue;
}

// Minimal typing for Gemini batch status lookup
interface GeminiRequestCounts { total?: number; completed?: number; failed?: number }
interface GeminiBatchStatus { state?: string; request_counts?: GeminiRequestCounts; requestCounts?: GeminiRequestCounts; dest?: GeminiDest }

// Create a new batch processing record
export async function createBatchProcessing(totalFiles: number, providedId?: string, userId?: string): Promise<string> {
    const batch = await prisma.batchProcessing.create({
        data: {
            // Use providedId when supplied so that our local record id matches the external batch id.
            ...(providedId ? { id: providedId } : {}),
            totalFiles,
            status: 'PENDING',
            ...(userId ? { userId } : {}),
        },
    });
    return batch.id;
}

// Update batch processing progress
export async function updateBatchProgress(
    batchId: string,
    updates: Partial<{
        status: BatchStatus;
        processedFiles: number;
        successfulFiles: number;
        failedFiles: number;
        blockedFiles: number;
        currentFile: string;
        estimatedCompletion: Date;
        startedAt: Date;
        completedAt: Date;
        errors: BatchErrorDetail[];
    }>
): Promise<void> {
    const { errors, ...rest } = updates;
    await prisma.batchProcessing.update({
        where: { id: batchId },
        data: {
            ...rest,
            ...(errors ? { errors: serializeBatchErrors(errors) } : {}),
            updatedAt: new Date(),
        },
    });

    // Note: revalidatePath removed from here because this function is called
    // from background contexts (processBatchInBackground) where revalidatePath
    // is not allowed. Revalidation happens via TanStack Query polling instead.
}

// Get active batch processing records
export async function getActiveBatches(): Promise<BatchProgressInfo[]> {
    const user = await requireAuth();

    // Include recently completed batches (within last 15 minutes) so users have time to view errors
    // Extended from 2 minutes to 15 minutes to give users sufficient time to click "Ver detalles"
    const fifteenMinutesAgo = new Date();
    fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);

    const localBatches = await prisma.batchProcessing.findMany({
        where: {
            userId: user.id,
            OR: [
                {
                    status: {
                        in: ['PENDING', 'PROCESSING']
                    }
                },
                {
                    status: {
                        in: ['COMPLETED', 'FAILED']
                    },
                    completedAt: {
                        gte: fifteenMinutesAgo
                    }
                }
            ]
        },
        orderBy: {
            createdAt: 'desc'
        },
    });

    // 🔄  Attempt to reconcile status with Gemini for active batches
    //     We only do this for batches that are still PENDING/PROCESSING to avoid
    //     unnecessary API calls once a batch is terminal.
    const reconciledBatches: typeof localBatches = [];

    for (const batch of localBatches) {
        if (['PENDING', 'PROCESSING'].includes(batch.status)) {
            try {
                // Retry logic for batch status check with timeout handling
                const remote = await retryGeminiOperation(async () => {
                    return await gemini.batches.get({ name: batch.id }) as GeminiBatchStatus;
                }, 3, 2000); // 3 retries with 2 second initial delay

                // Map Gemini state → local BatchStatus
                const state = remote?.state as string | undefined;
                const statusMap: Record<string, BatchStatus> = {
                    JOB_STATE_PENDING: 'PENDING',
                    JOB_STATE_RUNNING: 'PROCESSING',
                    JOB_STATE_SUCCEEDED: 'COMPLETED',
                    JOB_STATE_FAILED: 'FAILED',
                    JOB_STATE_EXPIRED: 'FAILED',
                    JOB_STATE_CANCELLED: 'CANCELLED',
                };
                const newStatus = state ? statusMap[state] ?? batch.status : batch.status;

                // Counts if present
                const rc = (remote?.request_counts ?? remote?.requestCounts ?? {});

                await updateBatchProgress(batch.id, {
                    status: newStatus,
                    processedFiles: rc.completed !== undefined || rc.failed !== undefined ? (rc.completed ?? 0) + (rc.failed ?? 0) : undefined,
                    successfulFiles: rc.completed,
                    failedFiles: rc.failed,
                });

                reconciledBatches.push({ ...batch, status: newStatus, processedFiles: (rc.completed ?? 0) + (rc.failed ?? 0), successfulFiles: rc.completed ?? 0, failedFiles: rc.failed ?? 0 });

                // If batch completed, ingest results
                if (newStatus === 'COMPLETED' && !batch.completedAt && remote?.dest) {
                    // Set completedAt BEFORE ingesting to prevent duplicate processing from concurrent polls
                    const now = new Date();
                    await updateBatchProgress(batch.id, {
                        completedAt: now,
                    });

                    // Now safely ingest results - concurrent polls will skip this batch due to completedAt being set
                    try {
                        await ingestBatchOutputFromGemini(batch.id, remote.dest);
                    } catch (ingestError) {
                        const errorMessage = ingestError instanceof Error ? ingestError.message : 'Failed to ingest batch results';

                        if (isGeminiTimeoutError(ingestError)) {
                            console.warn(`[getActiveBatches] Timeout ingesting batch results for ${batch.id}, marking for retry`);
                            // Reset completedAt so it can be retried on next poll - use direct Prisma update
                            await prisma.batchProcessing.update({
                                where: { id: batch.id },
                                data: { completedAt: null, updatedAt: new Date() },
                            });
                        } else {
                            console.error(`[getActiveBatches] Failed to ingest batch results for ${batch.id}:`, ingestError);
                            // Mark batch as failed for non-timeout errors
                            await updateBatchProgress(batch.id, {
                                status: 'FAILED',
                                errors: [
                                    {
                                        kind: 'DATABASE_ERROR',
                                        message: errorMessage,
                                        timestamp: new Date().toISOString(),
                                    },
                                ],
                            });
                        }
                    }
                }

                continue;
            } catch (err) {
                // Log error but don't fail the entire operation
                if (isGeminiTimeoutError(err)) {
                    console.warn(`[getActiveBatches] Timeout retrieving Gemini batch ${batch.id}, will retry on next poll`);
                } else {
                    console.error('[getActiveBatches] Failed to retrieve Gemini batch', batch.id, err);
                }
            }
        }

        reconciledBatches.push(batch);
    }

    const batches = reconciledBatches;

    return batches.map(batch => ({
        id: batch.id,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        successfulFiles: batch.successfulFiles,
        failedFiles: batch.failedFiles,
        blockedFiles: batch.blockedFiles,
        currentFile: batch.currentFile || undefined,
        estimatedCompletion: batch.estimatedCompletion || undefined,
        startedAt: batch.startedAt || undefined,
        completedAt: batch.completedAt || undefined,
        createdAt: batch.createdAt,
        errors: Array.isArray(batch.errors)
            ? (batch.errors as unknown as Array<Record<string, unknown>>).map((entry) => ({
                kind: (entry.kind as BatchErrorDetail['kind']) || 'UNKNOWN',
                message: String(entry.message ?? ''),
                fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
                invoiceCode: typeof entry.invoiceCode === 'string' ? entry.invoiceCode : undefined,
                timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
            }))
            : undefined,
    }));
}

// Get a specific batch by ID (useful for error dialog)
export async function getBatchById(batchId: string): Promise<BatchProgressInfo | null> {
    const user = await requireAuth();

    const batch = await prisma.batchProcessing.findFirst({
        where: {
            id: batchId,
            userId: user.id,
        },
    });

    if (!batch) {
        return null;
    }

    return {
        id: batch.id,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        successfulFiles: batch.successfulFiles,
        failedFiles: batch.failedFiles,
        blockedFiles: batch.blockedFiles,
        currentFile: batch.currentFile || undefined,
        estimatedCompletion: batch.estimatedCompletion || undefined,
        startedAt: batch.startedAt || undefined,
        completedAt: batch.completedAt || undefined,
        createdAt: batch.createdAt,
        errors: Array.isArray(batch.errors)
            ? (batch.errors as unknown as Array<Record<string, unknown>>).map((entry) => ({
                kind: (entry.kind as BatchErrorDetail['kind']) || 'UNKNOWN',
                message: String(entry.message ?? ''),
                fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
                invoiceCode: typeof entry.invoiceCode === 'string' ? entry.invoiceCode : undefined,
                timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
            }))
            : undefined,
    };
}

// Helper function to safely convert JSON error entry to BatchErrorDetail
function jsonErrorToBatchErrorDetail(entry: JsonErrorEntry): BatchErrorDetail {
    return {
        kind: (entry.kind as BatchErrorDetail['kind']) || 'UNKNOWN',
        message: String(entry.message ?? ''),
        fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
        invoiceCode: typeof entry.invoiceCode === 'string' ? entry.invoiceCode : undefined,
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    };
}

// Group batches that were created within a short time window (5 minutes) as they likely represent one upload session
function groupBatchesByTimeWindow(batches: BatchProcessingRecord[]): BatchProgressInfo[] {
    if (batches.length === 0) return [];

    // Sort by creation time (newest first)
    const sortedBatches = [...batches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const groupedSessions: BatchProgressInfo[] = [];
    const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    for (const batch of sortedBatches) {
        // Find if this batch belongs to an existing session
        const existingSession = groupedSessions.find(session => {
            const timeDiff = Math.abs(session.createdAt.getTime() - batch.createdAt.getTime());
            return timeDiff <= TIME_WINDOW_MS;
        });

        if (existingSession) {
            // Merge this batch into the existing session
            existingSession.totalFiles += batch.totalFiles;
            existingSession.processedFiles += batch.processedFiles;
            existingSession.successfulFiles += batch.successfulFiles;
            existingSession.failedFiles += batch.failedFiles;
            existingSession.blockedFiles += batch.blockedFiles;

            // Update status logic: if any batch is still processing/pending, session is processing
            // If all are completed but some failed, session is failed
            // If all completed successfully, session is completed
            if (batch.status === 'PROCESSING' || batch.status === 'PENDING') {
                existingSession.status = 'PROCESSING';
            } else if (batch.status === 'FAILED' && existingSession.status !== 'PROCESSING') {
                existingSession.status = 'FAILED';
            } else if (batch.status === 'COMPLETED' && existingSession.status !== 'PROCESSING' && existingSession.status !== 'FAILED') {
                existingSession.status = 'COMPLETED';
            }

            // Update timestamps
            if (!existingSession.startedAt || (batch.startedAt && batch.startedAt < existingSession.startedAt)) {
                existingSession.startedAt = batch.startedAt ?? undefined;
            }
            if (!existingSession.completedAt || (batch.completedAt && batch.completedAt > existingSession.completedAt)) {
                existingSession.completedAt = batch.completedAt ?? undefined;
            }

            // Merge errors
            if (batch.errors && Array.isArray(batch.errors)) {
                if (!existingSession.errors) existingSession.errors = [];
                existingSession.errors.push(...batch.errors.map((entry: unknown) => jsonErrorToBatchErrorDetail(entry as JsonErrorEntry)));
            }
        } else {
            // Create new session
            groupedSessions.push({
                id: `session-${batch.createdAt.getTime()}`, // Generate a unique ID for the session
                status: batch.status,
                totalFiles: batch.totalFiles,
                processedFiles: batch.processedFiles,
                successfulFiles: batch.successfulFiles,
                failedFiles: batch.failedFiles,
                blockedFiles: batch.blockedFiles,
                currentFile: batch.currentFile ?? undefined,
                estimatedCompletion: batch.estimatedCompletion ?? undefined,
                startedAt: batch.startedAt ?? undefined,
                completedAt: batch.completedAt ?? undefined,
                createdAt: batch.createdAt,
                errors: Array.isArray(batch.errors)
                    ? batch.errors.map((entry: unknown) => jsonErrorToBatchErrorDetail(entry as JsonErrorEntry))
                    : undefined,
            });
        }
    }

    // Align behavior with util (also caps to 10)
    return groupBatchesUtil(groupedSessions, { maxGroups: 10 });
}

// Get batch history for dashboard display (grouped by upload sessions)
export async function getBatchHistory(): Promise<BatchProgressInfo[]> {
    const user = await requireAuth();

    const batches = await prisma.batchProcessing.findMany({
        where: {
            userId: user.id,
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 50, // Get more batches to allow for grouping
    });

    return groupBatchesByTimeWindow(batches);
}

// Clean up old batch processing records (older than 7 days)
export async function cleanupOldBatches(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
        const result = await prisma.batchProcessing.deleteMany({
            where: {
                AND: [
                    {
                        status: {
                            in: ['COMPLETED', 'FAILED', 'CANCELLED']
                        }
                    },
                    {
                        createdAt: {
                            lt: sevenDaysAgo
                        }
                    }
                ]
            }
        });

        if (result.count > 0) {
        }
    } catch (error) {
        console.error("Error cleaning up old batch records:", error);
        // Don't throw - this is a maintenance task that shouldn't affect main processing
    }
}

// Ensure we have the Gemini API key
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable. This is required for batch AI processing.");
}

const gemini = new GoogleGenAI({ apiKey: geminiApiKey });

export interface CreateInvoiceResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    fileName?: string;
    isBlockedProvider?: boolean;
    batchId?: string; // Add batch ID to results
    isDuplicate?: boolean; // Flag to indicate if this is a duplicate invoice
    hasTotalsMismatch?: boolean;
    validationErrors?: BatchErrorDetail[];
}

// Type for items after initial extraction and validation, before sorting
interface ExtractedFileItem {
    file: File;
    extractedData: ExtractedPdfData | null;
    error?: string; // Error during extraction or initial validation
    fileName: string; // Store filename for results
}

// Type for the result of the transaction part of processing
interface TransactionOperationResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    isExisting?: boolean; // To distinguish from new invoices
    hasTotalsMismatch?: boolean;
    validationErrors?: BatchErrorDetail[];
}

export interface UpdateInvoiceItemInput {
    id?: string | null;
    materialId?: string | null;
    materialName: string;
    quantity: number;
    listPrice?: number | null;
    discountPercentage?: number | null;
    discountRaw?: string | null;
    unitPrice: number;
    totalPrice: number;
    workOrder?: string | null;
}

export interface UpdateInvoiceInput {
    invoiceId: string;
    totalAmount: number;
    items: UpdateInvoiceItemInput[];
    deletedItemIds?: string[];
}

export interface UpdateInvoiceActionResult {
    success: boolean;
    message: string;
    hasTotalsMismatch: boolean;
    errors?: string[];
}

type InvoiceWithProvider = Invoice & { provider: Provider };
type InvoiceWithProviderAndItems = InvoiceWithProvider & { items: (InvoiceItem & { material: Material })[] };

async function syncMaterialPricingForInvoiceItem(
    tx: Prisma.TransactionClient,
    invoice: InvoiceWithProvider,
    materialId: string,
    unitPriceDecimal: Prisma.Decimal,
): Promise<void> {
    const invoiceIssueDate = invoice.issueDate;

    const materialProvider = await tx.materialProvider.findUnique({
        where: {
            materialId_providerId: {
                materialId,
                providerId: invoice.providerId,
            },
        },
    });

    if (!materialProvider || !materialProvider.lastPriceDate || invoiceIssueDate.getTime() >= materialProvider.lastPriceDate.getTime()) {
        await tx.materialProvider.upsert({
            where: {
                materialId_providerId: {
                    materialId,
                    providerId: invoice.providerId,
                },
            },
            update: {
                lastPrice: unitPriceDecimal,
                lastPriceDate: invoiceIssueDate,
            },
            create: {
                materialId,
                providerId: invoice.providerId,
                lastPrice: unitPriceDecimal,
                lastPriceDate: invoiceIssueDate,
            },
        });
    }

    const existingAlert = await tx.priceAlert.findFirst({
        where: {
            invoiceId: invoice.id,
            materialId,
        },
    });

    if (existingAlert) {
        let percentageDecimal: Prisma.Decimal;

        if (existingAlert.oldPrice.isZero()) {
            percentageDecimal = unitPriceDecimal.isZero()
                ? new Prisma.Decimal(0)
                : new Prisma.Decimal(unitPriceDecimal.isPositive() ? 9999 : -9999);
        } else {
            percentageDecimal = unitPriceDecimal.minus(existingAlert.oldPrice)
                .dividedBy(existingAlert.oldPrice)
                .times(100);
        }

        await tx.priceAlert.update({
            where: { id: existingAlert.id },
            data: {
                newPrice: unitPriceDecimal,
                percentage: percentageDecimal,
            },
        });

        return;
    }

    const lastPurchase = await tx.invoiceItem.findFirst({
        where: {
            materialId,
            invoice: {
                providerId: invoice.providerId,
                issueDate: {
                    lt: invoiceIssueDate,
                },
            },
        },
        orderBy: {
            itemDate: 'desc',
        },
    });

    if (!lastPurchase) {
        return;
    }

    const lastPrice = lastPurchase.unitPrice;
    let percentageChange: Prisma.Decimal;

    if (!lastPrice.isZero()) {
        percentageChange = unitPriceDecimal.minus(lastPrice)
            .dividedBy(lastPrice)
            .times(100);
    } else {
        percentageChange = unitPriceDecimal.isZero()
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(unitPriceDecimal.isPositive() ? 9999 : -9999);
    }

    if (percentageChange.abs().gte(5)) {
        await tx.priceAlert.create({
            data: {
                materialId,
                providerId: invoice.providerId,
                oldPrice: lastPrice,
                newPrice: unitPriceDecimal,
                percentage: percentageChange,
                status: "PENDING",
                effectiveDate: invoiceIssueDate,
                invoiceId: invoice.id,
            },
        });
    }
}


interface CallPdfExtractAPIResponse {
    extractedData: ExtractedPdfData | null;
    error?: string;
}




// Function to normalize provider names for comparison
function normalizeProviderName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]/g, '') // Remove special characters and spaces
        .trim();
}

// Function to check if two provider names are similar
function areProviderNamesSimilar(name1: string, name2: string): boolean {
    const normalized1 = normalizeProviderName(name1);
    const normalized2 = normalizeProviderName(name2);

    // Check for exact match
    if (normalized1 === normalized2) return true;

    // Check if one name contains the other (for cases like "ACME S.L." vs "ACME SOCIEDAD LIMITADA")
    if (normalized1.length > 3 && normalized2.length > 3) {
        return normalized1.includes(normalized2) || normalized2.includes(normalized1);
    }

    return false;
}

// Function to check if a provider should be ignored
function isBlockedProvider(providerName: string): boolean {
    const normalizedName = normalizeProviderName(providerName);

    const blockedProviders = [
        'constraula',
        'sorigué',
        'sorigüe',
        'soriguè',
        'soriguê',
        'sorigui'
    ].map(name => normalizeProviderName(name));

    return blockedProviders.some(blocked => normalizedName.includes(blocked));
}


// Helper to build the extraction prompt
function buildExtractionPrompt(startFromItemNumber?: number): string {
    const itemStartInstruction = startFromItemNumber
        ? `\n\nIMPORTANT: Start extracting items from line item #${startFromItemNumber} onwards. Do NOT re-extract items before #${startFromItemNumber}. The HEADER and PROVIDER lines should be omitted - only output ITEM lines.`
        : '';

    return `Extract invoice data from this PDF document (consolidate all pages into a single invoice). Only extract visible data.${itemStartInstruction}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL RULES - ORDER IS SACRED!
═══════════════════════════════════════════════════════════════════════════════
✓ Extract PROVIDER first (MANDATORY): Company name, CIF/NIF, email, phone, address
✓ Extract HEADER: invoiceCode, issueDate (YYYY-MM-DD), totalAmount (with IVA), ivaPercentage (REQUIRED), retentionAmount (REQUIRED), workOrder
✓ DATE FORMAT IS CRITICAL: Always use YYYY-MM-DD (e.g., 2024-12-31). 
  - Spanish invoices use DD/MM/YYYY (31/12/2024) -> YOU MUST CONVERT TO YYYY-MM-DD (2024-12-31).
  - NEVER output YYYY-DD-MM (e.g., NEVER 2024-31-12).
✓ Extract items in EXACT VISUAL ORDER AS THEY APPEAR ON THE INVOICE
✓ Each table row is INDEPENDENT - never mix data between rows
✓ Output format: HEADER|7 fields, PROVIDER|6 fields, ITEM|11 fields per line

═══════════════════════════════════════════════════════════════════════════════
🚨 CRITICAL: PRESERVE EXACT ITEM ORDER - DO NOT REORDER!
═══════════════════════════════════════════════════════════════════════════════

❌ NEVER reorder items by price, code, or any other criteria
❌ NEVER sort items alphabetically or numerically
❌ NEVER group similar items together
❌ NEVER skip items that seem "unimportant"

✅ Extract items in the EXACT SEQUENCE they appear on the invoice
✅ If invoice shows: Item A, Item B, Item C → Output: Item A, Item B, Item C
✅ Order preservation is MORE IMPORTANT than data accuracy

🚨 RULE #1 - ABSOLUTE NO VERTICAL DISPLACEMENT (MOST COMMON ERROR!)
Each row is 100% INDEPENDENT. Think of each row as a separate invoice line.
• If Row 1 has blank price cells → Row 1 outputs 0.00 for those prices
• If Row 2 has actual prices → Row 2 outputs those actual prices
• NEVER take Row 2's prices and put them in Row 1's output
• NEVER "shift" values up from lower rows

WRONG: PACK item (Row 1 blank) gets prices from Row 2
CORRECT: PACK item (Row 1 blank) outputs 0.00, Row 2 outputs its actual prices

🚨 RULE #2 - STEP-BY-STEP EXTRACTION (FOLLOW EXACT VISUAL ORDER)
For each table row IN THE ORDER THEY APPEAR:
1. Read material name/code from THAT SPECIFIC ROW
2. Extract quantity from CANTIDAD/Uds column (0.00 if blank)
3. Extract discountRaw from %DTO column ("0" if blank/"NETO")
4. Extract unitPrice from PRECIO UNITARIO column (0.00 if blank)
5. Extract totalPrice from TOTAL/IMPORTE column (0.00 if blank)
6. NEVER look at cells from different rows to "fill in" missing values
7. OUTPUT ITEM IMMEDIATELY - do not batch or reorder

🚨 RULE #3 - PACKS/KITS HAVE NO PRICES (NORMAL!)
Items like "PACK 6 UDS", "KIT G FIJACION LAVABO-PARED" commonly have NO prices.
• These are bundled items not priced individually
• ALWAYS output: discountRaw="0", unitPrice=0.00, totalPrice=0.00
• Extract quantity if visible, but prices are ALWAYS 0.00
• DO NOT take prices from adjacent rows

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════
Use pipe (|) delimiter, tilde (~) for missing values.

HEADER|invoiceCode|issueDate|totalAmount|ivaPercentage|retentionAmount|workOrder
PROVIDER|name|cif|email|phone|address
ITEM|materialName|materialCode|isMaterial|quantity|discountRaw|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber

Field details:
• isMaterial: "true" (products) or "false" (services)
• discountRaw: "10", "50 5", "0" (text as shown)
• ivaPercentage: REQUIRED - IVA rate (e.g., "21.00" for 21%, "10.00" for 10%)
• retentionAmount: REQUIRED - Withholding amount (e.g., "15.00", "0.00" if none)
• Numbers: dot decimal (1234.56), no thousand separators
• Dates: YYYY-MM-DD format (e.g., "2024-12-31" for December 31, 2024, NOT "2024-31-12")
  - CRITICAL: First number after year is ALWAYS the MONTH (01-12)
  - Second number after year is ALWAYS the DAY (01-31)
  - Example: December 31, 2024 → "2024-12-31" (month=12, day=31)
  - Example: January 15, 2024 → "2024-01-15" (month=01, day=15)
• workOrder: OT codes from section headers like "S/REF: 074129/001941"

═══════════════════════════════════════════════════════════════════════════════
WORK ORDERS
═══════════════════════════════════════════════════════════════════════════════
Section headers like "S/REF: 074129/001941" → extract OT: "074129"
Apply current OT to ALL subsequent items until new section header.

═══════════════════════════════════════════════════════════════════════════════
SKIP THESE (NOT ITEMS)
═══════════════════════════════════════════════════════════════════════════════
❌ Loyalty points, promotions, metadata, asterisk dividers
✅ Only actual products/services with material names/codes

═══════════════════════════════════════════════════════════════════════════════
IVA AND RETENTIONS (REQUIRED FIELDS)
═══════════════════════════════════════════════════════════════════════════════
• IVA PERCENTAGE: Look for tax rate in invoice summary or header
  - Common Spanish rates: 21.00, 10.00, 4.00, 0.00
  - Look for: "IVA 21%", "21% IVA", "Tipo IVA: 21%", "IVA: 21.00%"
  - If multiple rates exist, extract the PRIMARY rate used
  - If unclear, use 21.00 (standard Spanish VAT rate)
  - Format: decimal number (21.00 not 21%)

• RETENTION AMOUNT: Withholding tax amount (IRPF/RETENCIONES)
  - Look for: "Retención", "IRPF", "Ret. IRPF", "Retenciones"
  - Extract the MONETARY AMOUNT withheld, not percentage
  - Examples: "Retención IRPF: 15.00€" → 15.00
  - If none mentioned, use 0.00
  - Format: decimal number with 2 decimals

═══════════════════════════════════════════════════════════════════════════════
CREDIT NOTES
═══════════════════════════════════════════════════════════════════════════════
Labels: "DEVOLUCIÓN", "ABONO", "NOTA DE CRÉDITO"
Extract signs exactly: "74,40-" → -74.40, "-74.40" → -74.40

═══════════════════════════════════════════════════════════════════════════════
EXAMPLE - PACK/KIT items with blank prices:
┌────────┬──────┬──────────────────────────────┬──────┬────────┬────────┐
│ CÓDIGO │ CANT │ CONCEPTO                     │ %DTO │ PRECIO │ IMPORTE│
├────────┼──────┼──────────────────────────────┼──────┼────────┼────────┤
│ 9900   │ 1.00 │ PACK 6 UDS SILICONA FUNGICIDA│      │        │        │ ← PACK: NO prices
│ KIT001 │ 2.00 │ KIT G FIJACION LAVABO-PARED  │      │        │        │ ← KIT: NO prices
│ 2182   │ 6.00 │ PATTEX SILICON 5 SILICONA    │ NETO │  3.00  │ 18.00  │ ← Regular: HAS prices
│ 2801   │12.00 │ MASCARILLA STEELPRO FFP2     │ 50 5 │  0.56  │  6.66  │ ← Sequential discount
└────────┴──────┴──────────────────────────────┴──────┴────────┴────────┘

CORRECT OUTPUT:
ITEM|PACK 6 UDS SILICONA FUNGICIDA BLANCA|9900|true|1.00|0|0.00|0.00|~|~|~|~
ITEM|KIT G FIJACION LAVABO-PARED|KIT001|true|2.00|0|0.00|0.00|~|~|~|~
ITEM|PATTEX SILICON 5 SILICONA|2182|true|6.00|0|3.00|18.00|~|~|~|~
ITEM|MASCARILLA STEELPRO FFP2|2801|true|12.00|50 5|0.56|6.66|~|~|~|~

Begin extraction now. Output ONLY structured lines (no explanations).`;
}

async function callPdfExtractAPI(file: File, batchErrors: BatchErrorDetail[]): Promise<CallPdfExtractAPIResponse> {
    try {
        const validation = validateUploadFile(file);
        if (!validation.valid) {
            console.warn(`Validation failed for ${file.name}: ${validation.error}`);
            return { extractedData: null, error: validation.error };
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');

        // Build prompt for direct PDF processing with text-based output
        const promptText = buildExtractionPrompt();

        const result = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: 'application/pdf', data: base64 } }
                    ]
                }
            ],
            config: {
                // temperature: 0.8,
                candidateCount: 1,
                thinkingConfig: {
                    thinkingBudget: 0
                },
            }
        });

        let text = (
            result.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
        );

        if (!text) {
            console.error(`No content in Gemini response for ${file.name}`);
            const errorMessage = "No content from Gemini.";
            pushBatchError(batchErrors, {
                kind: 'EXTRACTION_ERROR',
                message: errorMessage,
                fileName: file.name,
            });
            return { extractedData: null, error: errorMessage };
        }

        // Check for MAX_TOKENS truncation
        const finishReason = result.candidates?.[0]?.finishReason as string | undefined;
        if (finishReason === 'MAX_TOKENS') {
            console.warn(`[${file.name}] Response truncated due to MAX_TOKENS. Attempting to extract remaining items...`);

            // Parse what we have so far to identify the last successfully extracted item
            const partialData = parseTextBasedExtraction(text);
            if (partialData && partialData.items && partialData.items.length > 0) {
                const lastItemNumber = partialData.items[partialData.items.length - 1].lineNumber || partialData.items.length;
                console.log(`[${file.name}] Last extracted item: #${lastItemNumber}. Requesting remaining items...`);

                try {
                    // Make follow-up call for remaining items
                    const followUpPrompt = buildExtractionPrompt(Number(lastItemNumber) + 1);
                    const followUpResult = await gemini.models.generateContent({
                        model: GEMINI_MODEL,
                        contents: [
                            {
                                role: 'user',
                                parts: [
                                    { text: followUpPrompt },
                                    { inlineData: { mimeType: 'application/pdf', data: base64 } }
                                ]
                            }
                        ],
                        config: {
                            // temperature: 0.8,
                            candidateCount: 1,
                            thinkingConfig: {
                                thinkingBudget: 0
                            },
                        }
                    });

                    const followUpText = (
                        followUpResult.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
                    );

                    if (followUpText && followUpText.includes('ITEM|')) {
                        // Extract only ITEM lines from follow-up
                        const followUpItems = followUpText.split('\n')
                            .filter(line => line.trim().startsWith('ITEM|'))
                            .join('\n');

                        // Merge: original text (with HEADER, PROVIDER, and initial items) + follow-up items
                        text = text + '\n' + followUpItems;
                        console.log(`[${file.name}] Successfully merged follow-up extraction. Added ${followUpItems.split('\n').length} additional items.`);
                    } else {
                        console.warn(`[${file.name}] Follow-up extraction returned no items. Using partial data.`);
                    }
                } catch (followUpError) {
                    console.error(`[${file.name}] Follow-up extraction failed:`, followUpError);
                    // Continue with partial data - better than nothing
                }
            } else {
                console.warn(`[${file.name}] Could not parse partial data to determine last item. Using truncated response as-is.`);
            }
        }

        try {
            const extractedData = parseTextBasedExtraction(text);

            if (!extractedData) {
                // Check if response looks truncated (ends mid-line or has incomplete items)
                const looksLikeTruncation = text.includes('ITEM|') &&
                    (text.split('\n').some(line => {
                        const trimmed = line.trim();
                        return trimmed.startsWith('ITEM|') && trimmed.split('|').length < 12;
                    }) || !text.trim().endsWith('}'));

                const errorMsg = looksLikeTruncation
                    ? 'AI response appears truncated (incomplete items). The invoice may have too many items. Try processing manually or splitting into smaller invoices.'
                    : 'Invalid AI response format.';

                console.warn(`Failed to parse text-based response for ${file.name}: ${errorMsg}`);
                pushBatchError(batchErrors, {
                    kind: looksLikeTruncation ? 'EXTRACTION_ERROR' : 'PARSING_ERROR',
                    message: errorMsg,
                    fileName: file.name,
                });
                return { extractedData: null, error: errorMsg };
            }

            if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                console.warn(`Response for ${file.name} missing crucial invoice-level data. Data: ${JSON.stringify(extractedData)}`);
            }
            if (!extractedData.items || extractedData.items.length === 0) {
                console.warn(`File ${file.name} yielded invoice-level data but no line items were extracted by AI.`);
            }

            return { extractedData };

        } catch (parseError) {
            console.error(`Error parsing Gemini response for ${file.name}:`, parseError);
            pushBatchError(batchErrors, {
                kind: 'EXTRACTION_ERROR',
                message: `Error parsing Gemini response: ${(parseError as Error).message}`,
                fileName: file.name,
            });
            return { extractedData: null, error: "Error parsing Gemini response." };
        }

    } catch (error) {
        console.error(`Error extracting data from PDF ${file.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error during PDF extraction.";
        pushBatchError(batchErrors, {
            kind: 'EXTRACTION_ERROR',
            message: errorMessage,
            fileName: file.name,
        });
        return { extractedData: null, error: errorMessage };
    }
}

async function findOrCreateProviderTx(tx: Prisma.TransactionClient, providerData: ExtractedPdfData['provider'], userId?: string, providerType: 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL' = 'MATERIAL_SUPPLIER'): Promise<Provider> {
    const { cif, name, email, phone, address } = providerData;
    const canonicalCif = normalizeCifForComparison(cif) || cif;

    // Check if provider is blocked
    if (isBlockedProvider(name)) {
        const error = new Error(`Provider '${name}' is blocked and cannot be processed.`);
        (error as Error & { isBlockedProvider: boolean }).isBlockedProvider = true;
        throw error;
    }

    // Ensure CIF is available for provider unification
    if (!cif) {
        throw new Error(`Provider tax ID (CIF/NIF) is required to process invoices for '${name}'.`);
    }

    try {
        let existingProvider: Provider | null = null;
        let matchType = '';

        // Strategy 1: Robust CIF matching (normalize hyphens and ES prefix)
        const normalized = normalizeCifForComparison(cif);
        const variants = buildCifVariants(cif);

        // 1a. Try direct or normalized variant matches within current user's scope
        if (userId) {
            existingProvider = await tx.provider.findFirst({
                where: {
                    userId,
                    OR: [
                        { cif: { in: variants } },
                        // Fallback: provider.cif normalized equals normalized input (approximate via contains both ways)
                        { cif: { contains: normalized ?? '', mode: Prisma.QueryMode.insensitive } }
                    ]
                }
            });
        } else {
            existingProvider = await tx.provider.findFirst({
                where: {
                    OR: [
                        { cif: { in: variants } },
                        { cif: { contains: normalized ?? '', mode: Prisma.QueryMode.insensitive } }
                    ]
                }
            });
        }

        // 1b. Si no existe, buscar alias (also scoped by user if userId provided)
        if (!existingProvider) {
            const aliasFilter = userId ? {
                OR: [
                    { cif: { in: variants } },
                    ...(normalized ? [{ cif: { contains: normalized, mode: Prisma.QueryMode.insensitive } }] : [])
                ],
                provider: { is: { userId } }
            } : {
                OR: [
                    { cif: { in: variants } },
                    ...(normalized ? [{ cif: { contains: normalized, mode: Prisma.QueryMode.insensitive } }] : [])
                ]
            };

            const alias = await tx.providerAlias.findFirst({
                where: aliasFilter as Prisma.ProviderAliasWhereInput,
                include: { provider: true }
            });
            if (alias) {
                existingProvider = alias.provider;
                if (existingProvider) {
                    matchType = 'CIF alias';
                }
            }
        }

        if (existingProvider) {
            if (!matchType) matchType = 'CIF match';
        } else {
            // Strategy 2: Find by exact name match (case insensitive, scoped by user if userId provided)
            const nameFilter = userId ? {
                userId,
                name: {
                    equals: name,
                    mode: 'insensitive' as const
                }
            } : {
                name: {
                    equals: name,
                    mode: 'insensitive' as const
                }
            };

            existingProvider = await tx.provider.findFirst({
                where: nameFilter,
            });

            if (existingProvider) {
                matchType = 'exact name';
            } else if (phone) {
                // Strategy 3: Find by phone number (scoped by user if userId provided)
                const phoneFilter = userId ? {
                    userId,
                    phone: phone
                } : {
                    phone: phone
                };

                existingProvider = await tx.provider.findFirst({
                    where: phoneFilter,
                });

                if (existingProvider) {
                    matchType = 'phone number';
                } else {
                    // Strategy 4: Find by similar name (scoped by user if userId provided)
                    const allProvidersFilter = userId ? { userId } : {};
                    const allProviders = await tx.provider.findMany({
                        where: allProvidersFilter
                    });

                    for (const candidate of allProviders) {
                        if (areProviderNamesSimilar(name, candidate.name)) {
                            existingProvider = candidate;
                            matchType = 'similar name';
                            break;
                        }
                    }
                }
            }
        }

        // If we found an existing provider, update it with the latest information
        if (existingProvider) {
            const updatedProvider = await tx.provider.update({
                where: { id: existingProvider.id },
                data: {
                    name, // Always update name to keep it current
                    cif: canonicalCif, // Persist canonical normalized CIF
                    email: email || existingProvider.email, // Keep new email if provided, otherwise keep existing
                    phone: phone || existingProvider.phone, // Keep new phone if provided, otherwise keep existing
                    address: address || existingProvider.address, // Keep new address if provided, otherwise keep existing
                    type: providerType, // Update type if needed
                }
            });

            return updatedProvider;
        }

        // No existing provider found, create a new one

        // Since we already checked for existence scoped by user, we can create directly
        let createData: Prisma.ProviderCreateInput = {
            // Persist normalized canonical version
            cif: canonicalCif,
            name,
            email,
            phone,
            address,
            type: providerType,
        };

        // Only add user connection if userId provided (for user-scoped operations)
        if (userId) {
            createData = {
                ...createData,
                user: {
                    connect: { id: userId }
                }
            };
        }

        const newProvider = await tx.provider.create({
            data: createData,
        });

        return newProvider;

    } catch (error) {
        // Handle unique constraint violations that might still occur due to race conditions
        if (typeof error === 'object' && error !== null && 'code' in error &&
            (error as { code: string }).code === 'P2002') {

            // P2002 means a unique constraint was violated, likely the CIF
            // Another transaction might have created a provider with this CIF or a similar one
            // Do a comprehensive search to find the existing provider

            // Important: Use a try-catch for each query to prevent transaction abortion cascade
            try {
                // 1. Try exact CIF match first (scoped by user if userId provided)
                const cifFilter = userId ? { cif, userId } : { cif };
                let existingProvider = await tx.provider.findFirst({
                    where: cifFilter,
                });

                if (existingProvider) {
                    return existingProvider;
                }

                // 2. If not found by CIF, search by name (scoped by user if userId provided)
                const nameFilter = userId ? {
                    userId,
                    name: {
                        equals: name,
                        mode: 'insensitive' as const
                    }
                } : {
                    name: {
                        equals: name,
                        mode: 'insensitive' as const
                    }
                };

                existingProvider = await tx.provider.findFirst({
                    where: nameFilter,
                });

                if (existingProvider) {
                    // Update the existing provider with the new CIF if needed
                    const updatedProvider = await tx.provider.update({
                        where: { id: existingProvider.id },
                        data: {
                            cif, // Update with the CIF from current transaction
                            email: email || existingProvider.email,
                            phone: phone || existingProvider.phone,
                            address: address || existingProvider.address,
                            type: providerType,
                        }
                    });
                    return updatedProvider;
                }

                // 3. Search by phone if available (scoped by user if userId provided)
                if (phone) {
                    const phoneFilter = userId ? {
                        userId,
                        phone: phone
                    } : {
                        phone: phone
                    };

                    existingProvider = await tx.provider.findFirst({
                        where: phoneFilter,
                    });

                    if (existingProvider) {
                        const updatedProvider = await tx.provider.update({
                            where: { id: existingProvider.id },
                            data: {
                                cif,
                                name,
                                email: email || existingProvider.email,
                                phone: phone || existingProvider.phone,
                                address: address || existingProvider.address,
                                type: providerType,
                            }
                        });
                        return updatedProvider;
                    }
                }

                // 4. Search by similar name as last resort (scoped by user if provided)
                const allProviders = await tx.provider.findMany({
                    where: userId ? { userId } : undefined
                });
                for (const candidate of allProviders) {
                    if (areProviderNamesSimilar(name, candidate.name)) {
                        const updatedProvider = await tx.provider.update({
                            where: { id: candidate.id },
                            data: {
                                cif,
                                name,
                                email: email || candidate.email,
                                phone: phone || candidate.phone,
                                address: address || candidate.address,
                                type: providerType,
                            }
                        });
                        return updatedProvider;
                    }
                }
            } catch (recoveryError) {
                // If recovery queries fail (e.g., transaction is aborted), log and re-throw original error
                console.error('[findOrCreateProviderTx] Failed to recover from P2002 error:', recoveryError);
                throw error; // Re-throw original P2002 error
            }

            // If we still haven't found anything after all recovery attempts, re-throw
            throw error;
        }

        // Re-throw other errors
        throw error;
    }
}

// Optimized material finding function that uses cache when available
async function findOrCreateMaterialTxWithCache(
    tx: Prisma.TransactionClient,
    materialName: string,
    materialCode?: string,
    providerType?: string,
    materialCache?: Map<string, { id: string; name: string; code: string; referenceCode: string | null; category: string | null }>,
    userId?: string,
): Promise<Material> {
    const normalizedName = materialName.trim();

    // Priorizar el código extraído del PDF por Gemini
    // Handle case where AI returns string 'null' instead of null
    const finalCode: string | null = materialCode && materialCode !== 'null' ? normalizeMaterialCode(materialCode) : null;

    // Try cache first if available
    if (materialCache) {
        // Search by code first
        if (finalCode) {
            const cachedByCode = materialCache.get(`code:${finalCode}`);
            if (cachedByCode) {
                return await tx.material.findUnique({ where: { id: cachedByCode.id } }) as Material;
            }

            const cachedByRef = materialCache.get(`ref:${finalCode}`);
            if (cachedByRef) {
                return await tx.material.findUnique({ where: { id: cachedByRef.id } }) as Material;
            }
        }

        // Search by name
        const cachedByName = materialCache.get(`name:${normalizedName.toLowerCase()}`);
        if (cachedByName) {
            return await tx.material.findUnique({ where: { id: cachedByName.id } }) as Material;
        }

        // Check for similar codes in cache if finalCode is long enough
        if (finalCode && finalCode.length >= 6) {
            for (const [key, cachedMaterial] of materialCache.entries()) {
                if (key.startsWith('code:') || key.startsWith('ref:')) {
                    const cacheCode = key.substring(key.indexOf(':') + 1);
                    if (areMaterialCodesSimilar(finalCode, cacheCode)) {
                        return await tx.material.findUnique({ where: { id: cachedMaterial.id } }) as Material;
                    }
                }
            }
        }
    }

    // Fall back to original database lookup logic (scoped by user)
    return await findOrCreateMaterialTx(tx, materialName, materialCode, providerType, userId);
}

async function findOrCreateMaterialTx(tx: Prisma.TransactionClient, materialName: string, materialCode?: string, providerType?: string, userId?: string): Promise<Material> {
    const normalizedName = materialName.trim();
    let material: Material | null = null;

    // Priorizar el código extraído del PDF por Gemini
    // Handle case where AI returns string 'null' instead of null
    const finalCode: string | null = materialCode && materialCode !== 'null' ? normalizeMaterialCode(materialCode) : null;

    // Buscar primero por código exacto
    if (finalCode) {
        material = await tx.material.findFirst({
            where: { code: finalCode, userId: userId ?? undefined },
        });

        if (material) {
            return material;
        }
    }

    // Si no se encuentra por código exacto, buscar por referenceCode
    if (finalCode) {
        material = await tx.material.findFirst({
            where: { referenceCode: finalCode, userId: userId ?? undefined }
        });

        if (material) {
            return material;
        }
    }

    // Buscar por nombre exacto
    material = await tx.material.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' }, userId: userId ?? undefined }
    });

    if (material) {
        return material;
    }

    // Solo si no encontramos nada, hacer búsqueda por similitud (más conservadora)
    if (finalCode && finalCode.length >= 6) {
        const allMaterials = await tx.material.findMany({
            where: { userId: userId ?? undefined },
            select: { id: true, name: true, code: true, referenceCode: true, category: true }
        });

        for (const existingMaterial of allMaterials) {
            // Verificar similitud por código solo si ambos códigos son largos
            if (existingMaterial.code && areMaterialCodesSimilar(finalCode, existingMaterial.code)) {
                material = await tx.material.findUnique({
                    where: { id: existingMaterial.id }
                });
                break;
            }

            // También verificar con referenceCode
            if (existingMaterial.referenceCode && areMaterialCodesSimilar(finalCode, existingMaterial.referenceCode)) {
                material = await tx.material.findUnique({
                    where: { id: existingMaterial.id }
                });
                break;
            }
        }
    }

    // Set category based on provider type
    const category = providerType === 'MACHINERY_RENTAL' ? 'Alquiler Maquinaria' : 'Proveedor de Materiales';

    if (!material) {
        // Generate a base code
        const baseCode = (materialCode && materialCode !== 'null') ? materialCode : normalizedName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, '-')
            .substring(0, 45); // Leave room for suffix

        // Try to create with base code first, then with suffixes if needed
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const codeToTry = attempts === 0 ? baseCode : `${baseCode}-${attempts}`;

            // First, check if a material with this code already exists to avoid the unique constraint violation
            // which would abort the entire transaction.
            const existingMaterialWithCode = await tx.material.findFirst({
                where: { code: codeToTry, userId: userId ?? undefined },
                select: { id: true }, // Lightweight query
            });

            if (existingMaterialWithCode) {
                attempts++;
                continue; // Move to the next attempt with a new suffix
            }

            try {
                material = await tx.material.create({
                    data: {
                        code: codeToTry,
                        name: normalizedName,
                        category: category,
                        referenceCode: materialCode && materialCode !== 'null' ? materialCode : null, // Keep original code from PDF, but not string 'null'
                        ...(userId ? { user: { connect: { id: userId } } } : {}),
                    },
                });
                break; // Success, exit loop
            } catch (error) {
                // This catch block now primarily handles race conditions, where another
                // transaction created a material with the same code *after* our check but *before* our create.
                if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
                    attempts++;
                    // The loop will continue, and our check at the top will now find the conflicting material.
                } else {
                    // For any other error, we must re-throw to abort the transaction.
                    throw error;
                }
            }
        }

        if (!material) {
            // If the loop finishes without creating a material, it means all attempts to generate a unique code failed.
            // This is highly unlikely but possible under heavy concurrency.
            // As a final fallback, try to find the material by its name, as it might have been created by another transaction.
            const existingMaterial = await tx.material.findFirst({
                where: { name: { equals: normalizedName, mode: 'insensitive' } }
            });

            if (existingMaterial) {
                return existingMaterial;
            }

            throw new Error(`Could not create material '${normalizedName}' due to a temporary code conflict. Please try again.`);
        }
    } else {
        // Update category if not set or different
        if (!material.category || material.category !== category) {
            material = await tx.material.update({
                where: { id: material.id },
                data: { category: category },
            });
        }
    }
    return material;
}

// Helper function to safely parse item dates from various formats
function parseItemDate(itemDateString: string | null | undefined, invoiceIssueDate: Date): Date {
    if (!itemDateString || typeof itemDateString !== 'string') {
        return invoiceIssueDate;
    }

    const trimmed = itemDateString.trim();
    if (!trimmed) {
        return invoiceIssueDate;
    }

    // Try parsing as ISO date first (e.g., "2020-10-16")
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime()) && isoDate.getFullYear() >= 1900 && isoDate.getFullYear() <= 2100) {
        return isoDate;
    }

    // Try parsing common European formats
    // DD/MM/YYYY or DD-MM-YYYY
    const europeanDateMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (europeanDateMatch) {
        const [, day, month, year] = europeanDateMatch;
        const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1900 && parsed.getFullYear() <= 2100) {
            return parsed;
        }
    }

    // Try parsing as YYMMDD (common in some systems)
    if (trimmed.length === 6 && /^\d{6}$/.test(trimmed)) {
        const year = parseInt(trimmed.substring(0, 2));
        const month = parseInt(trimmed.substring(2, 4));
        const day = parseInt(trimmed.substring(4, 6));

        // Handle year ambiguity: assume 20xx for years 00-50, 19xx for 51-99
        const fullYear = year <= 50 ? 2000 + year : 1900 + year;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const parsed = new Date(fullYear, month - 1, day);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
    }

    // If all parsing attempts fail, log warning and use invoice date
    console.warn(`[parseItemDate] Could not parse item date '${trimmed}', using invoice date ${invoiceIssueDate.toISOString().split('T')[0]}`);
    return invoiceIssueDate;
}

async function processInvoiceItemTx(
    tx: Prisma.TransactionClient,
    itemData: ExtractedPdfItemData,
    invoiceId: string,
    invoiceIssueDate: Date,
    providerId: string,
    createdMaterial: Material,
    isMaterialItem: boolean
): Promise<{ invoiceItem: InvoiceItem; alert?: PriceAlert }> {
    const { quantity, unitPrice, totalPrice, itemDate, listPrice, discountPercentage } = itemData;

    if (typeof quantity !== 'number' || isNaN(quantity) ||
        typeof unitPrice !== 'number' || isNaN(unitPrice) ||
        typeof totalPrice !== 'number' || isNaN(totalPrice)) {
        throw new Error(`Invalid item data: quantity=${quantity}, unitPrice=${unitPrice}, totalPrice=${totalPrice}`);
    }

    const quantityDecimal = new Prisma.Decimal(quantity.toFixed(3));
    const currentUnitPriceDecimal = new Prisma.Decimal(unitPrice.toFixed(3));
    const totalPriceDecimal = new Prisma.Decimal(totalPrice.toFixed(3));
    const listPriceDecimal = typeof listPrice === 'number' && !isNaN(listPrice)
        ? new Prisma.Decimal(listPrice.toFixed(3))
        : null;
    const discountPercentageDecimal = typeof discountPercentage === 'number' && !isNaN(discountPercentage)
        ? new Prisma.Decimal(discountPercentage.toFixed(2))
        : null;

    // Use itemDate if provided and valid, otherwise use invoice issue date
    const effectiveDate = parseItemDate(itemDate, invoiceIssueDate);



    const invoiceItem = await tx.invoiceItem.create({
        data: {
            invoiceId,
            materialId: createdMaterial.id,
            quantity: quantityDecimal,
            listPrice: listPriceDecimal,
            discountPercentage: discountPercentageDecimal,
            discountRaw: itemData.discountRaw || null, // Store raw discount text
            unitPrice: currentUnitPriceDecimal,
            totalPrice: totalPriceDecimal,
            itemDate: effectiveDate, // Store the effective date for the item
            workOrder: itemData.workOrder || null,
            description: itemData.description || null,
            lineNumber: itemData.lineNumber || null,
        },
    });

    let alert: PriceAlert | undefined;

    // Only perform price alert checks and MaterialProvider updates if it's a material
    if (isMaterialItem) {
        // Find the chronologically previous invoice item for this material and provider
        const previousInvoiceItemRecord = await tx.invoiceItem.findFirst({
            where: {
                materialId: createdMaterial.id,
                invoice: {
                    providerId: providerId,
                },
                itemDate: { lt: effectiveDate }, // Use itemDate for comparison
                NOT: {
                    id: invoiceItem.id
                }
            },
            orderBy: { itemDate: 'desc' }, // Order by itemDate instead of invoice.issueDate
            select: { unitPrice: true, itemDate: true }
        });

        if (previousInvoiceItemRecord) {
            const previousPrice = previousInvoiceItemRecord.unitPrice;

            if (!currentUnitPriceDecimal.equals(previousPrice)) {
                const priceDiff = currentUnitPriceDecimal.minus(previousPrice);
                let percentageChangeDecimal: Prisma.Decimal;

                if (!previousPrice.isZero()) {
                    percentageChangeDecimal = priceDiff.dividedBy(previousPrice).times(100);
                } else {
                    percentageChangeDecimal = new Prisma.Decimal(currentUnitPriceDecimal.isPositive() ? 9999 : -9999);
                }

                // Verificar si ya existe una alerta para el mismo material, proveedor y fecha
                const existingAlert = await tx.priceAlert.findFirst({
                    where: {
                        materialId: createdMaterial.id,
                        providerId,
                        effectiveDate,
                    },
                });

                if (!existingAlert) {
                    try {
                        alert = await tx.priceAlert.create({
                            data: {
                                materialId: createdMaterial.id,
                                providerId,
                                oldPrice: previousPrice,
                                newPrice: currentUnitPriceDecimal,
                                percentage: percentageChangeDecimal,
                                status: "PENDING",
                                effectiveDate,
                                invoiceId,
                            },
                        });

                    } catch (alertError) {
                        // Manejar error de constraint único
                        if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                            (alertError as { code: string }).code === 'P2002') {
                            // Price alert already exists (constraint violation). Skipping duplicate creation.
                        } else {
                            // Re-lanzar otros errores
                            throw alertError;
                        }
                    }
                }
            }
        }

        // Update MaterialProvider to reflect the price from the item with the LATEST date
        const materialProvider = await tx.materialProvider.findUnique({
            where: {
                materialId_providerId: {
                    materialId: createdMaterial.id,
                    providerId,
                },
            },
        });

        if (materialProvider) {
            if (!materialProvider.lastPriceDate || effectiveDate.getTime() > materialProvider.lastPriceDate.getTime()) {
                if (!materialProvider.lastPrice.equals(currentUnitPriceDecimal) || (materialProvider.lastPriceDate && effectiveDate.getTime() !== materialProvider.lastPriceDate.getTime()) || !materialProvider.lastPriceDate) {
                    await tx.materialProvider.update({
                        where: { id: materialProvider.id },
                        data: {
                            lastPrice: currentUnitPriceDecimal,
                            lastPriceDate: effectiveDate,
                        },
                    });
                }
            }
        } else {

            await tx.materialProvider.create({
                data: {
                    materialId: createdMaterial.id,
                    providerId,
                    lastPrice: currentUnitPriceDecimal,
                    lastPriceDate: effectiveDate,
                },
            });
        }
    }

    return { invoiceItem, alert };
}

// Enhanced rate limit handling with exponential backoff
async function callPdfExtractAPIWithRetry(file: File, batchErrors: BatchErrorDetail[], maxRetries: number = 3): Promise<CallPdfExtractAPIResponse> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await callPdfExtractAPI(file, batchErrors);
            return result;

        } catch (error) {
            lastError = error;
            console.error(`[Attempt ${attempt}/${maxRetries}] Error calling PDF extract API for ${file.name}:`, error);

            // Check if it's a rate limit error
            const isRateLimitError = error instanceof Error &&
                (error.message.includes('429') || error.message.toLowerCase().includes('rate limit') ||
                    error.message.toLowerCase().includes('quota exceeded'));

            if (isRateLimitError && attempt < maxRetries) {
                // Simple backoff for rate limits
                const backoffTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000); // 2s, 4s, 8s, max 30s
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
            }

            // For non-rate-limit errors, retry with minimal delay
            if (!isRateLimitError && attempt < maxRetries) {
                const quickRetryDelay = 1000 * attempt; // 1s, 2s for attempts 1, 2
                await new Promise(resolve => setTimeout(resolve, quickRetryDelay));
                continue;
            }

            // If it's the last attempt or not retryable, break
            break;
        }
    }

    // If we get here, all retries failed
    const errorMessage = lastError instanceof Error ? lastError.message : "Unknown error during PDF extraction with retries.";
    return {
        extractedData: null,
        error: `Failed after ${maxRetries} attempts: ${errorMessage}`
    };
}

export async function createInvoiceFromFiles(
    formDataWithFiles: FormData
): Promise<{ overallSuccess: boolean; results: CreateInvoiceResult[]; batchId: string }> {
    const files = formDataWithFiles.getAll("files") as File[];
    if (!files || files.length === 0) {
        throw new Error("No files provided.");
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
        throw new Error(`Too many files. Maximum allowed is ${MAX_FILES_PER_UPLOAD}.`);
    }
    const totalBytes = files.reduce((sum, f) => sum + (typeof f.size === 'number' ? f.size : 0), 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new Error(`Total upload size exceeds ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }

    // Identify the current authenticated user so that all subsequent
    // provider/invoice creations are correctly scoped. Without this the UI
    // queries (which filter by userId) may fail to find newly created records
    // leading to the appearance that invoices "disappear".
    const user = await requireAuth();

    // Check if an existing batch ID was provided, otherwise create a new one
    const existingBatchId = formDataWithFiles.get("existingBatchId") as string | null;
    let batchId: string;

    if (existingBatchId) {
        batchId = existingBatchId;
    } else {
        // Create new batch processing record (fallback for backward compatibility)
        batchId = await createBatchProcessing(files.length, undefined, user.id);
    }

    // Start batch processing
    await updateBatchProgress(batchId, {
        status: 'PROCESSING',
        startedAt: new Date(),
    });

    // More conservative initial concurrency for larger batches
    let CONCURRENCY_LIMIT = files.length > 10 ?
        Math.min(6, Math.max(3, Math.ceil(files.length / 8))) : // Reduced for large batches
        Math.min(10, Math.max(4, Math.ceil(files.length / 5))); // Keep existing for small batches

    const allFileProcessingResults: Array<ExtractedFileItem> = [];


    // Add memory pressure detection
    const initialMemory = process.memoryUsage();

    // For very large batches (100+ files), add periodic memory cleanup
    const isVeryLargeBatch = files.length >= 100;

    const batchErrors: BatchErrorDetail[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
        const fileChunk = files.slice(i, i + CONCURRENCY_LIMIT);
        // Validate files early to avoid unnecessary processing
        const validatedChunk = fileChunk.map((file) => ({ file, validation: validateUploadFile(file) }));
        const invalids = validatedChunk.filter(v => !v.validation.valid);
        if (invalids.length > 0) {
            for (const inv of invalids) {
                allFileProcessingResults.push({ file: inv.file, extractedData: null, error: inv.validation.error || 'Invalid file', fileName: inv.file.name });
            }
        }
        const validFiles = validatedChunk.filter(v => v.validation.valid).map(v => v.file);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(files.length / CONCURRENCY_LIMIT);


        // Update batch progress
        const currentFileIndex = i + 1;
        const estimatedTimePerFile = 30; // seconds
        const remainingFiles = files.length - currentFileIndex;
        const estimatedCompletion = new Date(Date.now() + (remainingFiles * estimatedTimePerFile * 1000));

        await updateBatchProgress(batchId, {
            processedFiles: i,
            currentFile: fileChunk.length > 0 ? fileChunk[0].name : undefined,
            estimatedCompletion,
        });

        // Memory pressure check
        const currentMemory = process.memoryUsage();
        const heapUsedMB = Math.round(currentMemory.heapUsed / 1024 / 1024);
        const memoryGrowthMB = Math.round((currentMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024);

        if (heapUsedMB > 800 || memoryGrowthMB > 400) { // Conservative thresholds
            console.warn(`[Memory] High memory usage detected: ${heapUsedMB}MB heap (+${memoryGrowthMB}MB growth). Reducing concurrency.`);
            CONCURRENCY_LIMIT = Math.max(2, Math.floor(CONCURRENCY_LIMIT * 0.6));

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
        }

        // For very large batches, run periodic cleanup every 50 files
        if (isVeryLargeBatch && (i / CONCURRENCY_LIMIT) % 10 === 0 && i > 0) {
            if (global.gc) {
                global.gc();
            }
            // Small pause to allow memory cleanup
            await new Promise(resolve => setTimeout(resolve, 2000));
        }


        const chunkExtractionPromises = validFiles.map(async (file): Promise<ExtractedFileItem> => {
            // Basic guards already applied by validateUploadFile

            try {
                // Use the retry wrapper function
                const { extractedData, error: extractionError } = await callPdfExtractAPIWithRetry(file, batchErrors, 3);

                if (extractionError) {
                    return { file, extractedData, error: extractionError, fileName: file.name };
                }

                if (!extractedData) {
                    console.error(`[Batch ${batchNumber}] Failed to extract any usable invoice data for file: ${file.name}.`);
                    return { file, extractedData: null, error: "Failed to extract usable invoice data from PDF.", fileName: file.name };
                }
                if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                    console.warn(`[Batch ${batchNumber}] Missing crucial invoice-level data for file: ${file.name}. Data: ${JSON.stringify(extractedData)}`);
                    return {
                        file,
                        extractedData: extractedData,
                        error: "Missing or invalid crucial invoice-level data after PDF extraction.",
                        fileName: file.name
                    };
                }
                if (!extractedData.items || extractedData.items.length === 0) {
                    console.warn(`[Batch ${batchNumber}] No line items extracted for file: ${file.name}. Proceeding with invoice-level data if valid.`);
                }

                try {
                    new Date(extractedData.issueDate);
                    return {
                        file,
                        extractedData: extractedData,
                        fileName: file.name
                    };
                } catch (dateError) {
                    console.warn(`[Batch ${batchNumber}] Invalid issue date format for file: ${file.name}. Date: ${extractedData.issueDate}`);
                    return {
                        file,
                        extractedData: extractedData,
                        error: `Invalid issue date format: ${extractedData.issueDate}.`,
                        fileName: file.name
                    };
                }
            } catch (topLevelError: unknown) {
                console.error(`[Batch ${batchNumber}] Unexpected error during file processing for ${file.name}:`, topLevelError);
                const errorMessage = topLevelError instanceof Error ? topLevelError.message : "Unknown error during file item processing.";
                return { file, extractedData: null, error: errorMessage, fileName: file.name };
            }
        });

        const chunkResults = await Promise.all(chunkExtractionPromises);
        allFileProcessingResults.push(...chunkResults);

    }

    const extractionResults: ExtractedFileItem[] = allFileProcessingResults.map(item => ({
        file: item.file,
        extractedData: item.extractedData,
        error: item.error,
        fileName: item.fileName,
    }));

    // 2. Separate items with extraction errors from processable items
    const finalResults: CreateInvoiceResult[] = [];
    const processableItems: ExtractedFileItem[] = [];

    for (const item of extractionResults) {
        if (item.error) {
            pushBatchError(batchErrors, {
                kind: 'EXTRACTION_ERROR',
                message: item.error,
                fileName: item.fileName,
                invoiceCode: item.extractedData?.invoiceCode,
            });
            finalResults.push({
                success: false,
                message: item.error,
                fileName: item.fileName
            });
        } else if (item.extractedData) {
            processableItems.push(item);
        }
    }

    // 3. Sort processable items by issueDate (ascending)
    processableItems.sort((a, b) => {
        const dateA = a.extractedData?.issueDate ? new Date(a.extractedData.issueDate).getTime() : 0;
        const dateB = b.extractedData?.issueDate ? new Date(b.extractedData.issueDate).getTime() : 0;
        if (dateA === 0 || dateB === 0) return 0;
        return dateA - dateB;
    });



    // 4. Pre-process providers to reduce race conditions and improve performance
    const uniqueProviders = new Map<string, ExtractedPdfData['provider']>();

    for (const item of processableItems) {
        if (item.extractedData?.provider?.cif) {
            const key = item.extractedData.provider.cif;
            if (!uniqueProviders.has(key)) {
                uniqueProviders.set(key, item.extractedData.provider);
            }
        }
    }

    // Pre-create/find providers to avoid race conditions during invoice processing
    const providerCache = new Map<string, string>(); // CIF -> Provider ID
    for (const [cif, providerData] of uniqueProviders.entries()) {
        try {
            const provider = await prisma.$transaction(async (tx) => {
                return await findOrCreateProviderTx(tx, providerData, user.id);
            });
            providerCache.set(cif, provider.id);
        } catch (error) {
            console.error(`Failed to pre-process provider ${providerData.name} (${cif}):`, error);
            // Continue with other providers, individual invoice processing will handle this error
        }
    }

    // Pre-load a focused set of materials to reduce queries during processing
    console.log("Pre-loading existing materials for faster lookup...");
    const referencedCodes = new Set<string>();
    for (const item of processableItems) {
        const items = item.extractedData?.items ?? [];
        for (const it of items) {
            if (it.materialCode && it.materialCode !== 'null') {
                referencedCodes.add(normalizeMaterialCode(it.materialCode));
            }
        }
    }

    // Try to fetch by referenced codes first, then fall back to a recent slice
    let existingMaterials = await prisma.material.findMany({
        select: { id: true, name: true, code: true, referenceCode: true, category: true },
        where: {
            userId: user.id,
            OR: referencedCodes.size > 0 ? [
                { code: { in: Array.from(referencedCodes) } },
                { referenceCode: { in: Array.from(referencedCodes) } },
            ] : undefined,
        },
        take: referencedCodes.size > 0 ? undefined : 300,
        orderBy: referencedCodes.size > 0 ? undefined : { updatedAt: 'desc' },
    });

    if (existingMaterials.length === 0) {
        existingMaterials = await prisma.material.findMany({
            select: { id: true, name: true, code: true, referenceCode: true, category: true },
            where: { userId: user.id },
            take: 300,
            orderBy: { updatedAt: 'desc' },
        });
    }

    const materialCache = new Map<string, { id: string; name: string; code: string; referenceCode: string | null; category: string | null }>();

    // Cache by name (normalized)
    for (const material of existingMaterials) {
        const normalizedName = material.name.toLowerCase().trim();
        materialCache.set(`name:${normalizedName}`, material);

        // Cache by code if available
        if (material.code) {
            materialCache.set(`code:${material.code}`, material);
        }

        // Cache by reference code if available
        if (material.referenceCode) {
            materialCache.set(`ref:${material.referenceCode}`, material);
        }
    }


    // 5. Process database operations strictly sequentially to preserve chronological order
    const DB_CONCURRENCY_LIMIT = 1; // Enforce chronological processing by date
    const dbResults: CreateInvoiceResult[] = [];

    // Circuit breaker for catastrophic failures
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;
    let circuitBreakerTripped = false;

    for (let i = 0; i < processableItems.length; i += DB_CONCURRENCY_LIMIT) {
        const chunk = processableItems.slice(i, i + DB_CONCURRENCY_LIMIT);

        const chunkPromises = chunk.map(async (item): Promise<CreateInvoiceResult> => {
            const { file, extractedData, fileName } = item;
            if (!extractedData) {
                return { success: false, message: "No extracted data", fileName: fileName };
            }

            // Update batch progress
            await updateBatchProgress(batchId, {
                currentFile: fileName,
            });

            // Retry mechanism for handling provider race conditions during concurrent processing
            const maxRetries = 3;
            let lastError: unknown = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {

                    // For large invoices, use longer timeout and optimized processing
                    const itemCount = extractedData.items?.length || 0;
                    const isLargeInvoice = itemCount > 50;
                    const isVeryLargeInvoice = itemCount > 200;

                    // Adaptive timeout based on item count
                    const baseTimeout = isVeryLargeInvoice ? 1800000 : isLargeInvoice ? 900000 : 300000; // 30min/15min/5min
                    const transactionTimeout = Math.min(baseTimeout, 1800000); // Cap at 30 minutes

                    if (isLargeInvoice) {
                    }

                    const totalsCheck = evaluateTotalsMismatch(extractedData.items ?? [], extractedData.totalAmount, { ivaPercentage: extractedData.ivaPercentage, retentionAmount: extractedData.retentionAmount });
                    const validationWarnings: BatchErrorDetail[] = totalsCheck.hasMismatch ? [
                        {
                            kind: 'VALIDATION_ERROR',
                            message: buildTotalsMismatchMessage(extractedData.invoiceCode, totalsCheck, extractedData.totalAmount),
                            fileName,
                            invoiceCode: extractedData.invoiceCode,
                            timestamp: new Date().toISOString(),
                        }
                    ] : [];

                    const operationResult: TransactionOperationResult = await prisma.$transaction(async (tx) => {
                        // Use cached provider if available, otherwise fall back to findOrCreateProviderTx
                        let provider;
                        const cachedProviderId = extractedData.provider.cif ? providerCache.get(extractedData.provider.cif) : undefined;

                        try {
                            if (cachedProviderId) {
                                provider = await tx.provider.findUnique({
                                    where: { id: cachedProviderId }
                                });

                                // Either the provider disappeared (unlikely) or it belongs to
                                // another user. Fallback to a scoped lookup.
                                if (!provider || provider.userId !== user.id) {
                                    provider = await findOrCreateProviderTx(tx, extractedData.provider, user.id);
                                }
                            } else {
                                provider = await findOrCreateProviderTx(tx, extractedData.provider, user.id);
                            }
                        } catch (providerError) {
                            // If provider lookup/creation fails, throw immediately to prevent transaction abortion
                            const errorMsg = providerError instanceof Error ? providerError.message : 'Failed to process provider';
                            console.error(`[batch processing] Provider error for invoice ${extractedData.invoiceCode}:`, errorMsg);
                            throw providerError; // Re-throw to trigger clean transaction rollback
                        }

                        const existingInvoice = await tx.invoice.findFirst({
                            where: {
                                invoiceCode: extractedData.invoiceCode,
                                providerId: provider.id
                            },
                            select: { id: true, originalFileName: true }
                        });

                        if (existingInvoice) {
                            const originalFile = existingInvoice.originalFileName ?? 'Archivo desconocido';
                            const currentFile = fileName;
                            const duplicateMessage = `Factura Duplicada - ${extractedData.invoiceCode} - Archivo original: ${originalFile}, Archivo duplicado: ${currentFile}`;
                            pushBatchError(batchErrors, {
                                kind: 'DUPLICATE_INVOICE',
                                message: duplicateMessage,
                                fileName,
                                invoiceCode: extractedData.invoiceCode,
                            });
                            return {
                                success: true,
                                message: duplicateMessage,
                                invoiceId: existingInvoice.id,
                                alertsCreated: 0,
                                isExisting: true,
                                isDuplicate: true
                            };
                        }

                        const invoice = await tx.invoice.create({
                            data: {
                                invoiceCode: extractedData.invoiceCode,
                                providerId: provider.id,
                                issueDate: new Date(extractedData.issueDate),
                                totalAmount: new Prisma.Decimal(extractedData.totalAmount.toFixed(2)),
                                ivaPercentage: new Prisma.Decimal(extractedData.ivaPercentage.toFixed(2)),
                                retentionAmount: new Prisma.Decimal(extractedData.retentionAmount.toFixed(2)),
                                originalFileName: fileName,
                                status: "PROCESSED",
                                hasTotalsMismatch: totalsCheck.hasMismatch,
                            },
                        });

                        let alertsCounter = 0;
                        const currentInvoiceIssueDate = new Date(extractedData.issueDate);
                        const intraInvoiceMaterialPriceHistory = new Map<string, { price: Prisma.Decimal; date: Date; invoiceItemId: string }>();

                        // Pre-process work orders: if any item has an OT, apply it to ALL items
                        // This handles the case where work orders should be invoice-wide
                        const workOrdersInInvoice = new Set<string>();
                        for (const item of extractedData.items) {
                            if (item.workOrder && item.workOrder.trim()) {
                                workOrdersInInvoice.add(item.workOrder.trim());
                            }
                        }

                        // If multiple different work orders found, log warning but use the first one
                        // In practice, an invoice should typically have only one work order
                        let invoiceWorkOrder: string | null = null;
                        if (workOrdersInInvoice.size > 0) {
                            invoiceWorkOrder = Array.from(workOrdersInInvoice)[0]; // Use first work order found
                            if (workOrdersInInvoice.size > 1) {
                                console.warn(`[Invoice ${extractedData.invoiceCode}] Multiple work orders found in invoice: ${Array.from(workOrdersInInvoice).join(', ')}. Using: ${invoiceWorkOrder}`);
                            }
                        }

                        // Apply the invoice work order to all items
                        if (invoiceWorkOrder) {
                            for (const item of extractedData.items) {
                                if (!item.workOrder || item.workOrder.trim() === '') {
                                    item.workOrder = invoiceWorkOrder;
                                }
                            }
                        }

                        // Process items in optimized chunks for performance
                        const ITEM_CHUNK_SIZE = isVeryLargeInvoice ? 15 : isLargeInvoice ? 30 : 999; // Smaller chunks for very large invoices
                        const itemChunks = [];
                        for (let i = 0; i < extractedData.items.length; i += ITEM_CHUNK_SIZE) {
                            itemChunks.push(extractedData.items.slice(i, i + ITEM_CHUNK_SIZE));
                        }

                        console.log(`[Invoice ${invoice.invoiceCode}] Processing ${extractedData.items.length} items in ${itemChunks.length} chunk(s) (chunk size: ${ITEM_CHUNK_SIZE})`);

                        for (let chunkIndex = 0; chunkIndex < itemChunks.length; chunkIndex++) {
                            const itemChunk = itemChunks[chunkIndex];

                            if (isLargeInvoice && chunkIndex > 0) {
                                // Minimal delay between chunks for very large invoices
                                await new Promise(resolve => setTimeout(resolve, isVeryLargeInvoice ? 50 : 100));
                            }

                            for (const itemData of itemChunk) {
                                if (!itemData.materialName) {
                                    console.warn(`Skipping item due to missing material name in invoice ${invoice.invoiceCode} from file ${fileName}`);
                                    continue;
                                }

                                if (typeof itemData.quantity !== 'number' || isNaN(itemData.quantity)) {
                                    console.warn(`Skipping item due to invalid or missing quantity in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}, Quantity: ${itemData.quantity}`);
                                    continue;
                                }

                                if (typeof itemData.unitPrice !== 'number' || isNaN(itemData.unitPrice)) {
                                    console.warn(`Missing or invalid unit price for item in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}. Defaulting to 0.`);
                                    itemData.unitPrice = 0;
                                }
                                if (typeof itemData.totalPrice !== 'number' || isNaN(itemData.totalPrice)) {
                                    console.warn(`Missing or invalid total price for item in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}. Defaulting to 0.`);
                                    itemData.totalPrice = 0;
                                }

                                if (typeof itemData.listPrice !== 'number' || isNaN(itemData.listPrice)) {
                                    itemData.listPrice = itemData.unitPrice;
                                }

                                if (typeof itemData.discountPercentage !== 'number' || isNaN(itemData.discountPercentage)) {
                                    itemData.discountPercentage = 0;
                                }

                                const isMaterialItem = typeof itemData.isMaterial === 'boolean' ? itemData.isMaterial : true;

                                if (!isMaterialItem) {
                                    const quantityDecimal = new Prisma.Decimal(itemData.quantity.toFixed(3));
                                    const listPriceDecimal = typeof itemData.listPrice === 'number' && !isNaN(itemData.listPrice)
                                        ? new Prisma.Decimal(itemData.listPrice.toFixed(3))
                                        : null;
                                    const discountPercentageDecimal = typeof itemData.discountPercentage === 'number' && !isNaN(itemData.discountPercentage)
                                        ? new Prisma.Decimal(itemData.discountPercentage.toFixed(2))
                                        : null;
                                    const currentUnitPriceDecimal = new Prisma.Decimal(itemData.unitPrice.toFixed(3));
                                    const totalPriceDecimal = new Prisma.Decimal(itemData.totalPrice.toFixed(3));
                                    const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;

                                    await tx.invoiceItem.create({
                                        data: {
                                            invoiceId: invoice.id,
                                            materialId: (await findOrCreateMaterialTxWithCache(tx, itemData.materialName, itemData.materialCode, provider.type, materialCache, user.id)).id,
                                            quantity: quantityDecimal,
                                            listPrice: listPriceDecimal,
                                            discountPercentage: discountPercentageDecimal,
                                            discountRaw: itemData.discountRaw || null,
                                            unitPrice: currentUnitPriceDecimal,
                                            totalPrice: totalPriceDecimal,
                                            itemDate: effectiveItemDate,
                                            workOrder: itemData.workOrder || null,
                                        },
                                    });
                                    continue;
                                }

                                let material: Material;
                                try {
                                    material = await findOrCreateMaterialTxWithCache(tx, itemData.materialName, itemData.materialCode, provider.type, materialCache, user.id);
                                } catch (materialError) {
                                    console.error(`Error creating/finding material '${itemData.materialName}' in invoice ${invoice.invoiceCode}:`, materialError);
                                    throw new Error(`Failed to process material '${itemData.materialName}': ${materialError instanceof Error ? materialError.message : 'Unknown error'}`);
                                }
                                const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;
                                const currentItemUnitPrice = new Prisma.Decimal(itemData.unitPrice.toFixed(3));

                                const lastSeenPriceRecordInThisInvoice = intraInvoiceMaterialPriceHistory.get(material.id);

                                if (lastSeenPriceRecordInThisInvoice) {
                                    if (effectiveItemDate.getTime() >= lastSeenPriceRecordInThisInvoice.date.getTime() &&
                                        !currentItemUnitPrice.equals(lastSeenPriceRecordInThisInvoice.price)) {

                                        const priceDiff = currentItemUnitPrice.minus(lastSeenPriceRecordInThisInvoice.price);
                                        let percentageChangeDecimal: Prisma.Decimal;
                                        if (!lastSeenPriceRecordInThisInvoice.price.isZero()) {
                                            percentageChangeDecimal = priceDiff.dividedBy(lastSeenPriceRecordInThisInvoice.price).times(100);
                                        } else {
                                            percentageChangeDecimal = new Prisma.Decimal(currentItemUnitPrice.isPositive() ? 9999 : -9999);
                                        }

                                        try {
                                            await tx.priceAlert.create({
                                                data: {
                                                    materialId: material.id,
                                                    providerId: provider.id,
                                                    oldPrice: lastSeenPriceRecordInThisInvoice.price,
                                                    newPrice: currentItemUnitPrice,
                                                    percentage: percentageChangeDecimal,
                                                    status: "PENDING",
                                                    effectiveDate: effectiveItemDate,
                                                    invoiceId: invoice.id,
                                                },
                                            });
                                            alertsCounter++;
                                        } catch (alertError) {
                                            // Manejar error de constraint único para alertas intra-factura
                                            if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                                                (alertError as { code: string }).code === 'P2002') {
                                            } else {
                                                throw alertError;
                                            }
                                        }
                                    }
                                }

                                const { invoiceItem, alert: interInvoiceAlert } = await processInvoiceItemTx(
                                    tx,
                                    itemData,
                                    invoice.id,
                                    currentInvoiceIssueDate,
                                    provider.id,
                                    material,
                                    isMaterialItem
                                );

                                if (interInvoiceAlert) {
                                    alertsCounter++;
                                }

                                if (isMaterialItem) {
                                    intraInvoiceMaterialPriceHistory.set(material.id, {
                                        price: invoiceItem.unitPrice,
                                        date: invoiceItem.itemDate,
                                        invoiceItemId: invoiceItem.id
                                    });
                                }
                            }
                        }
                        return {
                            success: true,
                            message: `Invoice ${invoice.invoiceCode} created successfully.`,
                            invoiceId: invoice.id,
                            alertsCreated: alertsCounter,
                            isExisting: false,
                            hasTotalsMismatch: totalsCheck.hasMismatch,
                            validationErrors: validationWarnings.length > 0 ? validationWarnings : undefined,
                        };
                    }, {
                        timeout: transactionTimeout, // Use dynamic timeout based on invoice size
                        maxWait: 300000 // 5 minutes max wait
                    });

                    // Success! Return the result
                    const baseResult: CreateInvoiceResult = {
                        success: operationResult.success,
                        message: operationResult.message,
                        invoiceId: operationResult.invoiceId,
                        alertsCreated: operationResult.alertsCreated,
                        fileName,
                        hasTotalsMismatch: operationResult.hasTotalsMismatch ?? false,
                    };

                    if (operationResult.isExisting) {
                        baseResult.isDuplicate = true;
                    }

                    if (operationResult.validationErrors?.length) {
                        baseResult.validationErrors = operationResult.validationErrors;
                        if (!baseResult.message.toLowerCase().includes('descuadre')) {
                            baseResult.message = `${baseResult.message} (Revisión requerida: descuadre detectado)`;
                        }
                        for (const warning of operationResult.validationErrors) {
                            pushBatchError(batchErrors, warning);
                        }
                    }

                    return baseResult;

                } catch (error) {
                    lastError = error;
                    console.error(`Error processing sorted invoice from ${fileName} (attempt ${attempt}/${maxRetries}):`, error);

                    // Check for memory-related errors
                    const isMemoryError = error instanceof Error && (
                        error.message.includes('out of memory') ||
                        error.message.includes('ENOMEM') ||
                        error.message.includes('heap') ||
                        error.message.includes('JavaScript heap out of memory')
                    );

                    // Check for timeout errors
                    const isTimeoutError = error instanceof Error && (
                        error.message.includes('timeout') ||
                        error.message.includes('ETIMEDOUT') ||
                        error.message.includes('Connection timeout')
                    );

                    // Check for database connection errors
                    const isConnectionError = typeof error === 'object' && error !== null && 'code' in error &&
                        ['P1000', 'P1001', 'P1002', 'P1008', 'P1009', 'P1010'].includes((error as { code: string }).code);

                    // Check if this error is worth retrying
                    const isRetryableError = typeof error === 'object' && error !== null && 'code' in error &&
                        (error as { code: string }).code === 'P2002'; // Unique constraint violation

                    const isBlockedProviderError = error instanceof Error &&
                        (error as Error & { isBlockedProvider?: boolean }).isBlockedProvider;

                    // Special handling for memory errors
                    if (isMemoryError) {
                        console.error(`[Memory Error] Memory exhaustion detected for ${fileName}. This file will be skipped.`);
                        if (global.gc) {
                            global.gc();
                        }
                        break; // Don't retry memory errors
                    }

                    // Special handling for timeout errors - retry with longer timeout
                    if (isTimeoutError && attempt < maxRetries) {
                        console.warn(`[Timeout] Transaction timeout for ${fileName}, will retry with longer timeout...`);
                        const delay = attempt * 2000 + Math.random() * 1000; // 2-3s, 4-5s delays
                        console.log(`Will retry after ${delay.toFixed(0)}ms delay...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // Special handling for connection errors - longer retry delays
                    if (isConnectionError && attempt < maxRetries) {
                        console.warn(`[Connection] Database connection error for ${fileName}, will retry...`);
                        const delay = attempt * 5000 + Math.random() * 2000; // 5-7s, 10-12s delays
                        console.log(`Will retry after ${delay.toFixed(0)}ms delay...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // Don't retry for blocked providers, memory errors, or on last attempt
                    if (isBlockedProviderError || isMemoryError || attempt === maxRetries || (!isRetryableError && !isTimeoutError && !isConnectionError)) {
                        break; // Exit retry loop
                    }

                    // Add a small delay before retrying to reduce race conditions
                    const delay = attempt * 100 + Math.random() * 100; // 100-200ms, 200-300ms, etc.
                    console.log(`Will retry after ${delay.toFixed(0)}ms delay...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // If we get here, all retries failed
            const baseMessage = `Failed to create invoice from ${fileName}`;
            let specificMessage = "An unexpected error occurred.";
            let isBlockedProvider = false;

            if (lastError instanceof Error) {
                specificMessage = lastError.message;

                // Check if this is a blocked provider error
                if ((lastError as Error & { isBlockedProvider?: boolean }).isBlockedProvider) {
                    isBlockedProvider = true;
                    specificMessage = `Provider is blocked: ${specificMessage}`;
                    console.warn(`Blocked provider detected in file ${fileName}: ${specificMessage}`);
                } else if (specificMessage.includes('Failed to process material')) {
                    specificMessage = `Material processing error: ${specificMessage}`;
                } else if (specificMessage.includes('after 10 attempts due to code conflicts')) {
                    specificMessage = `Unable to create unique material code. This may indicate a data consistency issue.`;
                } else if (specificMessage.includes('Provider') && specificMessage.includes('is blocked')) {
                    isBlockedProvider = true;
                    specificMessage = `This provider is not allowed for processing.`;
                }
            }

            const isPrismaP2002Error = (e: unknown): e is { code: string; meta?: { target?: string[] } } => {
                return typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';
            };

            if (isPrismaP2002Error(lastError)) {
                if (lastError.meta && lastError.meta.target) {
                    if (lastError.meta.target.includes('invoiceCode') && extractedData) {
                        console.warn(`Duplicate invoice code '${extractedData.invoiceCode}' for file: ${fileName} (after ${maxRetries} retries)`);
                        specificMessage = `An invoice with code '${extractedData.invoiceCode}' already exists.`;
                    } else if (lastError.meta.target.includes('code')) {
                        specificMessage = `A material with this code already exists. Race condition persisted after ${maxRetries} retries.`;
                    } else if (lastError.meta.target.includes('cif')) {
                        specificMessage = `Provider CIF constraint conflict persisted after ${maxRetries} retries. This may indicate a provider consolidation issue.`;
                    }
                }
            }

            return {
                success: false,
                message: isBlockedProvider ? specificMessage : `${baseMessage}: ${specificMessage}`,
                fileName: fileName,
                isBlockedProvider
            };
        });

        const chunkResults = await Promise.all(chunkPromises);
        dbResults.push(...chunkResults);

        // Update circuit breaker state
        const failuresInChunk = chunkResults.filter(r => !r.success && !r.isBlockedProvider).length;
        if (failuresInChunk > 0) {
            consecutiveFailures += failuresInChunk;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                circuitBreakerTripped = true;
                console.error(`[Circuit Breaker] ${consecutiveFailures} consecutive failures detected. Stopping further processing to prevent system overload.`);

                // Mark remaining items as failed
                const remainingItems = processableItems.slice(i + DB_CONCURRENCY_LIMIT);
                for (const item of remainingItems) {
                    dbResults.push({
                        success: false,
                        message: `Processing stopped due to circuit breaker (${consecutiveFailures} consecutive failures)`,
                        fileName: item.fileName
                    });
                }
                break;
            }
        } else {
            // Reset counter on successful batch
            consecutiveFailures = 0;
        }
    }

    // Combine extraction errors with database results
    finalResults.push(...dbResults);

    // Add batch ID to all results
    const finalResultsWithBatch = finalResults.map(result => ({
        ...result,
        batchId
    }));

    // Calculate final batch statistics
    const successfulInvoices = finalResultsWithBatch.filter(r => r.success && !r.message.includes("already exists"));
    const duplicateInvoices = finalResultsWithBatch.filter(r => r.success && r.message.includes("already exists"));
    const failedInvoices = finalResultsWithBatch.filter(r => !r.success && !r.isBlockedProvider);
    const blockedInvoices = finalResultsWithBatch.filter(r => r.isBlockedProvider);

    // Update final batch status
    const overallSuccess = finalResultsWithBatch.every(r => r.success);
    const finalStatus: BatchStatus = circuitBreakerTripped ? 'FAILED' :
        overallSuccess ? 'COMPLETED' : 'COMPLETED'; // Still completed even with some failures

    // For statistical purposes, treat duplicates as separate category but ensure errors are saved
    // Duplicates are "successful" (no error occurred) but still need to be tracked
    const totalFailed = failedInvoices.length + blockedInvoices.length;

    await updateBatchProgress(batchId, {
        status: finalStatus,
        processedFiles: files.length,
        successfulFiles: successfulInvoices.length + duplicateInvoices.length,
        failedFiles: totalFailed,
        blockedFiles: blockedInvoices.length,
        completedAt: new Date(),
        errors: batchErrors.length > 0 ? batchErrors : undefined,
    });

    // Performance summary
    const batchRecord = await prisma.batchProcessing.findUnique({
        where: { id: batchId },
        select: { createdAt: true }
    });
    const processingTimeMs = batchRecord ? Date.now() - batchRecord.createdAt.getTime() : null;

    const avgTimePerFile = processingTimeMs ? (processingTimeMs / files.length / 1000).toFixed(2) : 'N/A';
    const totalAlerts = finalResultsWithBatch.reduce((sum, r) => sum + (r.alertsCreated || 0), 0);


    const newlyCreatedInvoices = finalResultsWithBatch.filter(r => r.success && r.invoiceId && !r.message.includes("already exists"));

    if (newlyCreatedInvoices.length > 0) {
        revalidatePath("/facturas");
        if (newlyCreatedInvoices.some(r => r.alertsCreated && r.alertsCreated > 0)) {
            revalidatePath("/alertas");
        }
    }

    // Clean up old batch records as maintenance (non-blocking)
    if (Math.random() < 0.1) { // Only run cleanup 10% of the time to reduce overhead
        cleanupOldBatches().catch(error => {
            console.error("Background cleanup failed:", error);
        });
    }

    return { overallSuccess, results: finalResultsWithBatch, batchId };
}

// Manual invoice creation function for form submissions
export interface ManualInvoiceData {
    provider: {
        name: string;
        cif: string | null;
        email: string | null;
        phone: string | null;
    };
    invoiceCode: string;
    issueDate: string;
    ivaPercentage?: number;
    retentionAmount?: number;
    items: Array<{
        materialName: string;
        materialCode?: string;
        quantity: number;
        listPrice?: number;
        discountPercentage?: number;
        discountRaw?: string | null;
        unitPrice: number;
        totalPrice: number;
        description: string | null;
        workOrder: string | null;
        isMaterial: boolean;
    }>;
    totalAmount: number;
}

export async function createManualInvoice(data: ManualInvoiceData): Promise<CreateInvoiceResult> {
    const user = await requireAuth()

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Validate provider data
            if (!data.provider.cif) {
                throw new Error(`Provider '${data.provider.name}' must have a CIF for manual invoice creation.`);
            }

            // 2. Find or create provider
            const provider = await findOrCreateProviderTx(tx, {
                name: data.provider.name,
                cif: data.provider.cif,
                email: data.provider.email || undefined,
                phone: data.provider.phone || undefined,
            }, user.id);

            const totalsCheck = evaluateTotalsMismatch(
                data.items.map(item => ({ totalPrice: item.totalPrice })),
                data.totalAmount
            );

            // 3. Check if invoice already exists
            const existingInvoice = await tx.invoice.findFirst({
                where: {
                    invoiceCode: data.invoiceCode,
                    providerId: provider.id,
                },
            });

            if (existingInvoice) {
                return {
                    success: false,
                    message: `Invoice with code '${data.invoiceCode}' already exists for this provider.`,
                };
            }

            // 4. Create invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceCode: data.invoiceCode,
                    providerId: provider.id,
                    issueDate: new Date(data.issueDate),
                    totalAmount: new Prisma.Decimal(data.totalAmount.toFixed(2)),
                    ivaPercentage: new Prisma.Decimal((data.ivaPercentage ?? 21.00).toFixed(2)),
                    retentionAmount: new Prisma.Decimal((data.retentionAmount ?? 0.00).toFixed(2)),
                    status: "PROCESSED",
                    hasTotalsMismatch: totalsCheck.hasMismatch,
                },
            });

            let alertsCounter = 0;
            const currentInvoiceIssueDate = new Date(data.issueDate);

            // 5. Pre-process work orders: if any item has an OT, apply it to ALL items
            const workOrdersInInvoice = new Set<string>();
            for (const item of data.items) {
                if (item.workOrder && item.workOrder.trim()) {
                    workOrdersInInvoice.add(item.workOrder.trim());
                }
            }

            // If multiple different work orders found, log warning but use the first one
            let invoiceWorkOrder: string | null = null;
            if (workOrdersInInvoice.size > 0) {
                invoiceWorkOrder = Array.from(workOrdersInInvoice)[0]; // Use first work order found
                if (workOrdersInInvoice.size > 1) {
                    console.warn(`[Manual Invoice ${data.invoiceCode}] Multiple work orders found in invoice: ${Array.from(workOrdersInInvoice).join(', ')}. Using: ${invoiceWorkOrder}`);
                }
            }

            // Apply the invoice work order to all items
            if (invoiceWorkOrder) {
                for (const item of data.items) {
                    if (!item.workOrder || item.workOrder.trim() === '') {
                        item.workOrder = invoiceWorkOrder;
                    }
                }
            }

            // 6. Process each item
            for (const rawItem of data.items) {
                const itemData = { ...rawItem };
                if (!itemData.materialName) {
                    console.warn(`Skipping item due to missing material name in manual invoice ${invoice.invoiceCode}`);
                    continue;
                }

                // Find or create material
                const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialCode, provider.type, user.id);

                const quantityDecimal = new Prisma.Decimal(itemData.quantity.toFixed(3));
                const listPriceDecimal = typeof itemData.listPrice === 'number' && !isNaN(itemData.listPrice)
                    ? new Prisma.Decimal(itemData.listPrice.toFixed(3))
                    : null;
                const discountPercentageDecimal = typeof itemData.discountPercentage === 'number' && !isNaN(itemData.discountPercentage)
                    ? new Prisma.Decimal(itemData.discountPercentage.toFixed(2))
                    : null;
                const unitPriceDecimal = new Prisma.Decimal(itemData.unitPrice.toFixed(3));
                const totalPriceDecimal = new Prisma.Decimal(itemData.totalPrice.toFixed(3));

                // Create invoice item
                const invoiceItem = await tx.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        materialId: material.id,
                        quantity: quantityDecimal,
                        listPrice: listPriceDecimal,
                        discountPercentage: discountPercentageDecimal,
                        discountRaw: itemData.discountRaw || null,
                        unitPrice: unitPriceDecimal,
                        totalPrice: totalPriceDecimal,
                        itemDate: currentInvoiceIssueDate,
                        description: itemData.description,
                        workOrder: itemData.workOrder,
                    },
                });

                // Only create price alerts for material items
                if (itemData.isMaterial) {
                    // Check for price changes (only inter-invoice for manual entries)
                    const lastPurchase = await tx.invoiceItem.findFirst({
                        where: {
                            materialId: material.id,
                            invoice: {
                                providerId: provider.id,
                                issueDate: {
                                    lt: currentInvoiceIssueDate,
                                },
                            },
                        },
                        orderBy: {
                            itemDate: 'desc',
                        },
                    });

                    if (lastPurchase) {
                        const currentPrice = unitPriceDecimal;
                        const lastPrice = lastPurchase.unitPrice;

                        if (!currentPrice.equals(lastPrice)) {
                            const priceDiff = currentPrice.minus(lastPrice);
                            let percentageChange: Prisma.Decimal;

                            if (!lastPrice.isZero()) {
                                percentageChange = priceDiff.dividedBy(lastPrice).times(100);
                            } else {
                                percentageChange = new Prisma.Decimal(currentPrice.isPositive() ? 9999 : -9999);
                            }

                            // Only create alert if change is significant (>5%)
                            if (percentageChange.abs().gte(5)) {
                                try {
                                    await tx.priceAlert.create({
                                        data: {
                                            materialId: material.id,
                                            providerId: provider.id,
                                            oldPrice: lastPrice,
                                            newPrice: currentPrice,
                                            percentage: percentageChange,
                                            status: "PENDING",
                                            effectiveDate: currentInvoiceIssueDate,
                                            invoiceId: invoice.id,
                                        },
                                    });
                                    alertsCounter++;
                                } catch (alertError) {
                                    // Manejar error de constraint único en facturas manuales
                                    if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                                        (alertError as { code: string }).code === 'P2002') {
                                    } else {
                                        throw alertError;
                                    }
                                }
                            }
                        }
                    }

                    // Update or create MaterialProvider relationship
                    await tx.materialProvider.upsert({
                        where: {
                            materialId_providerId: {
                                materialId: material.id,
                                providerId: provider.id,
                            },
                        },
                        update: {
                            lastPriceDate: currentInvoiceIssueDate,
                            lastPrice: new Prisma.Decimal(itemData.unitPrice.toFixed(3)),
                        },
                        create: {
                            materialId: material.id,
                            providerId: provider.id,
                            lastPriceDate: currentInvoiceIssueDate,
                            lastPrice: new Prisma.Decimal(itemData.unitPrice.toFixed(3)),
                        },
                    });
                }
            }

            return {
                success: true,
                message: `Manual invoice ${invoice.invoiceCode} created successfully.`,
                invoiceId: invoice.id,
                alertsCreated: alertsCounter,
                hasTotalsMismatch: totalsCheck.hasMismatch,
            };
        });

        // Revalidate paths if successful
        if (result.success) {
            revalidatePath("/facturas");
            if (result.alertsCreated && result.alertsCreated > 0) {
                revalidatePath("/alertas");
            }
        }

        if (result.hasTotalsMismatch) {
            return {
                ...result,
                message: `${result.message} (Revisión requerida: descuadre detectado)`,
            };
        }

        return result;
    } catch (error) {
        console.error("Error creating manual invoice:", error);

        let errorMessage = "An unexpected error occurred.";
        let isBlockedProvider = false;

        if (error instanceof Error) {
            errorMessage = error.message;

            // Check if this is a blocked provider error
            if ((error as Error & { isBlockedProvider?: boolean }).isBlockedProvider) {
                isBlockedProvider = true;
            }
        }

        // Handle specific Prisma errors
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const prismaError = error as { code: string; meta?: { target?: string[] } };
            if (prismaError.code === 'P2002' && prismaError.meta?.target?.includes('invoiceCode')) {
                errorMessage = `An invoice with code '${data.invoiceCode}' already exists.`;
            }
        }

        return {
            success: false,
            message: errorMessage,
            isBlockedProvider,
        };
    }
}

// ---------------------------------------------------------------------------
// 🏗️  Helper: Build a real JSONL line for the Batch API for one PDF file.
// ---------------------------------------------------------------------------

async function prepareBatchLine(file: File): Promise<string> {
    // Validate file before heavy processing
    const validation = validateUploadFile(file);
    if (!validation.valid) {
        throw new Error(validation.error || 'Invalid file');
    }
    // 1️⃣  Read original file and compute base64 to send as inlineData to Gemini
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    // 2️⃣  Build prompt for direct PDF processing with text-based output
    const promptText = buildExtractionPrompt();

    // Build Gemini JSONL request line
    const jsonlObject = {
        key: file.name,
        request: {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: 'application/pdf', data: base64 } }
                    ]
                }
            ],
            generationConfig: {
                // temperature: 0.8,
                candidateCount: 1,
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        }
    };

    return JSON.stringify(jsonlObject);
}

// Convenience: generate all lines in parallel with limited concurrency (4)
async function buildBatchJsonl(files: File[]): Promise<string> {
    const CONCURRENCY = 4;
    const lines: string[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        const chunk = files.slice(i, i + CONCURRENCY);
        const validChunk = chunk.filter(f => validateUploadFile(f).valid);
        const chunkLines = await Promise.all(validChunk.map(prepareBatchLine));
        lines.push(...chunkLines);
    }
    return lines.join("\n");
}

// Convenience: generate JSONL chunks whose size stays safely under the 100 MB limit imposed by the Batch API
// Stay well below that hard limit so we never lose the entire
// batch due to a single oversize upload.
const MAX_BATCH_FILE_SIZE = 90 * 1024 * 1024; // 90 MB safety threshold

interface JsonlChunk {
    content: string;
    files: File[];
}

async function buildBatchJsonlChunks(files: File[]): Promise<JsonlChunk[]> {
    const chunks: JsonlChunk[] = [];

    // Allow limited parallelism to accelerate heavy pdfToPng work.
    // Use more conservative concurrency for very large batches to avoid OOM.
    const CONCURRENCY = files.length >= 250 ? 1 : files.length >= 150 ? 2 : 4;

    console.log(`[buildBatchJsonlChunks] Building JSONL for ${files.length} files with concurrency ${CONCURRENCY}`);

    let currentLines: string[] = [];
    let currentSize = 0;
    let currentFiles: File[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        // Slice the next group of files and process them in parallel.
        const slice = files.slice(i, i + CONCURRENCY).filter(f => validateUploadFile(f).valid);

        const results = await Promise.all(
            slice.map(async (file) => {
                const line = await prepareBatchLine(file);
                return { file, line } as const;
            })
        );

        // Append each prepared line, starting new chunks when size would exceed the cap.
        for (const { file, line } of results) {
            const lineSize = Buffer.byteLength(line, "utf8") + 1; // +1 for newline

            if (currentSize + lineSize > MAX_BATCH_FILE_SIZE && currentLines.length > 0) {
                chunks.push({ content: currentLines.join("\n"), files: currentFiles });
                currentLines = [];
                currentFiles = [];
                currentSize = 0;
            }

            currentLines.push(line);
            currentFiles.push(file);
            currentSize += lineSize;
        }

        // Memory monitoring & opportunistic GC
        const mem = process.memoryUsage();
        const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
        if (heapMb > 1500) {
            console.warn(`[buildBatchJsonlChunks] High heap usage detected (${heapMb} MB). Triggering GC and throttling…`);
            if (global.gc) {
                global.gc();
            }
            // Small delay to let GC do its work in tight loops
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    if (currentLines.length > 0) {
        chunks.push({ content: currentLines.join("\n"), files: currentFiles });
    }

    return chunks;
}

// ---------------------------------------------------------------------------
// 🏗️  Helper: Persist extracted JSON response (used by webhook)
// ---------------------------------------------------------------------------

export async function saveExtractedInvoice(extractedData: ExtractedPdfData, fileName?: string, pdfUrl?: string): Promise<CreateInvoiceResult> {
    const user = await requireAuth()

    try {
        const result = await prisma.$transaction(async (tx) => {
            // ✅ Provider - wrap in try-catch to prevent transaction abortion
            let provider: Provider;
            try {
                provider = await findOrCreateProviderTx(tx, extractedData.provider, user.id);
            } catch (providerError) {
                // If provider creation/lookup fails, throw immediately to rollback transaction cleanly
                const errorMsg = providerError instanceof Error ? providerError.message : 'Failed to process provider';
                console.error(`[saveExtractedInvoice] Provider error for invoice ${extractedData.invoiceCode} (file: ${fileName ?? "unknown"}):`, errorMsg);
                throw providerError; // Re-throw to trigger transaction rollback
            }

            // ❌  Duplicate check - Only flag as duplicate if the SAME file was uploaded before
            // Skip duplicate check if this is the first time we're seeing this specific file
            const existingInvoice = await tx.invoice.findFirst({
                where: { invoiceCode: extractedData.invoiceCode, providerId: provider.id },
                select: { id: true, originalFileName: true }
            });
            if (existingInvoice) {
                const originalFile = existingInvoice.originalFileName ?? 'Archivo desconocido';
                const currentFile = fileName ?? 'Archivo desconocido';

                // Only consider it a duplicate if it's actually a different file
                // If the filenames match exactly, this is likely a race condition from concurrent batch processing
                if (originalFile === currentFile) {
                    console.warn(`[saveExtractedInvoice] Race condition detected: Invoice ${extractedData.invoiceCode} was already created by a concurrent batch job with the same file ${currentFile}. Skipping without error.`);
                    return {
                        success: true, // Return success to avoid error reporting
                        message: `Invoice ${extractedData.invoiceCode} already processed (concurrent batch)`,
                        invoiceId: existingInvoice.id,
                        isDuplicate: false, // Not a user-facing duplicate, just a race condition
                    };
                }

                console.warn(`[saveExtractedInvoice] Invoice ${extractedData.invoiceCode} already exists for provider ${provider.name} (original file: ${originalFile}, duplicate file: ${currentFile})`);
                return {
                    success: false,
                    message: `Factura Duplicada - ${extractedData.invoiceCode} - Archivo original: ${originalFile}, Archivo duplicado: ${currentFile}`,
                    invoiceId: existingInvoice.id,
                    isDuplicate: true,
                };
            }

            const totalsCheck = evaluateTotalsMismatch(extractedData.items ?? [], extractedData.totalAmount, { ivaPercentage: extractedData.ivaPercentage, retentionAmount: extractedData.retentionAmount });
            const validationWarnings: BatchErrorDetail[] = totalsCheck.hasMismatch ? [
                {
                    kind: 'VALIDATION_ERROR',
                    message: buildTotalsMismatchMessage(extractedData.invoiceCode, totalsCheck, extractedData.totalAmount),
                    fileName: fileName ?? 'unknown',
                    invoiceCode: extractedData.invoiceCode,
                    timestamp: new Date().toISOString(),
                }
            ] : [];

            // ✅ Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceCode: extractedData.invoiceCode,
                    providerId: provider.id,
                    issueDate: new Date(extractedData.issueDate),
                    totalAmount: new Prisma.Decimal(extractedData.totalAmount.toFixed(2)),
                    ivaPercentage: new Prisma.Decimal(extractedData.ivaPercentage.toFixed(2)),
                    retentionAmount: new Prisma.Decimal(extractedData.retentionAmount.toFixed(2)),
                    originalFileName: fileName,
                    pdfUrl: pdfUrl || null, // Store R2 URL for viewing
                    status: "PROCESSED",
                    hasTotalsMismatch: totalsCheck.hasMismatch,
                },
            });

            let alertsCreated = 0;
            let itemsProcessed = 0;
            let itemsSkipped = 0;

            // Create material cache for performance optimization
            const materialCache = new Map<string, { id: string; name: string; code: string; referenceCode: string | null; category: string | null }>();

            // Detect credit notes: if totalAmount is negative but items are positive, negate all item prices
            const isCreditNote = extractedData.totalAmount < 0;
            let processedItems = extractedData.items;
            if (isCreditNote) {
                const itemsSum = extractedData.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
                const allItemsPositive = extractedData.items.every(item => (item.totalPrice || 0) >= 0);

                if (allItemsPositive && itemsSum > 0) {
                    console.warn(`[Credit Note Sign Error] Invoice ${extractedData.invoiceCode} has negative totalAmount (${extractedData.totalAmount}) but ALL ${extractedData.items.length} items are positive! Items sum: ${itemsSum.toFixed(2)}, Expected total: ${extractedData.totalAmount}. Correcting by negating all item prices.`);

                    // Create corrected items with negated prices
                    processedItems = extractedData.items.map(item => ({
                        ...item,
                        unitPrice: -(Math.abs(item.unitPrice || 0)),
                        totalPrice: -(Math.abs(item.totalPrice || 0)),
                        listPrice: item.listPrice ? -(Math.abs(item.listPrice)) : item.listPrice,
                    }));
                }
            }

            // Pre-process work orders: if any item has an OT, apply it to ALL items
            const workOrdersInInvoice = new Set<string>();
            for (const item of processedItems) {
                if (item.workOrder && item.workOrder.trim()) {
                    workOrdersInInvoice.add(item.workOrder.trim());
                }
            }

            // If multiple different work orders found, log warning but use the first one
            let invoiceWorkOrder: string | null = null;
            if (workOrdersInInvoice.size > 0) {
                invoiceWorkOrder = Array.from(workOrdersInInvoice)[0]; // Use first work order found
                if (workOrdersInInvoice.size > 1) {
                    console.warn(`[Batch Invoice ${extractedData.invoiceCode}] Multiple work orders found in invoice: ${Array.from(workOrdersInInvoice).join(', ')}. Using: ${invoiceWorkOrder}`);
                }
            }

            // Apply the invoice work order to all items
            if (invoiceWorkOrder) {
                for (const item of processedItems) {
                    if (!item.workOrder || item.workOrder.trim() === '') {
                        item.workOrder = invoiceWorkOrder;
                    }
                }
            }

            for (const item of processedItems) {
                // 🚦 Validate item data to prevent runtime errors
                if (!item.materialName) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Skipping line item due to missing material name (file: ${fileName ?? "unknown"}). Item data:`, item);
                    itemsSkipped++;
                    continue;
                }

                if (typeof item.quantity !== "number" || isNaN(item.quantity)) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Skipping item '${item.materialName}' due to invalid quantity: ${item.quantity} (file: ${fileName ?? "unknown"})`);
                    itemsSkipped++;
                    continue; // Quantity is mandatory to create an item
                }

                // Default missing or invalid prices to 0 so the invoice can still be saved
                if (typeof item.listPrice !== "number" || isNaN(item.listPrice)) {
                    (item as unknown as { listPrice: number }).listPrice = typeof item.unitPrice === "number" && !isNaN(item.unitPrice) ? item.unitPrice : 0;
                }
                if (typeof item.discountPercentage !== "number" || isNaN(item.discountPercentage)) {
                    (item as unknown as { discountPercentage: number }).discountPercentage = 0;
                }
                if (typeof item.unitPrice !== "number" || isNaN(item.unitPrice)) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Invalid or missing unitPrice for '${item.materialName}'. Defaulting to discount-adjusted list price (file: ${fileName ?? "unknown"})`);
                    const listPriceVal = (item.listPrice ?? 0);
                    const adjusted = listPriceVal * (1 - ((item.discountPercentage ?? 0) / 100));
                    (item as unknown as { unitPrice: number }).unitPrice = Number.isFinite(adjusted) ? adjusted : 0;
                }
                if (typeof item.totalPrice !== "number" || isNaN(item.totalPrice)) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Invalid or missing totalPrice for '${item.materialName}'. Defaulting to unitPrice * quantity (file: ${fileName ?? "unknown"})`);
                    (item as unknown as { totalPrice: number }).totalPrice = Number(((item.unitPrice ?? 0) * item.quantity).toFixed(3));
                }

                // Validate material code - skip items with obviously invalid codes
                if (item.materialCode && (item.materialCode === 'true' || item.materialCode === 'false' || item.materialCode.length < 3 || !/^[a-zA-Z0-9\-_\.]+$/.test(item.materialCode))) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Skipping item '${item.materialName}' due to invalid material code: '${item.materialCode}' (file: ${fileName ?? "unknown"})`);
                    itemsSkipped++;
                    continue;
                }

                try {
                    const material = await findOrCreateMaterialTxWithCache(tx, item.materialName, item.materialCode, provider.type, materialCache, user.id);
                    await processInvoiceItemTx(
                        tx,
                        item,
                        invoice.id,
                        new Date(extractedData.issueDate),
                        provider.id,
                        material,
                        item.isMaterial ?? true,
                    ).then(({ alert }) => {
                        if (alert) alertsCreated += 1;
                    });
                    itemsProcessed++;
                } catch (itemErr) {
                    console.error(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Failed to process item '${item.materialName}' (file: ${fileName ?? "unknown"}):`, itemErr);
                    console.error(`[saveExtractedInvoice] Item data:`, item);
                    itemsSkipped++;
                }
            }

            return {
                success: true,
                message: `Invoice ${invoice.invoiceCode} created (${itemsProcessed} items, ${alertsCreated} alerts)`,
                invoiceId: invoice.id,
                alertsCreated,
                hasTotalsMismatch: totalsCheck.hasMismatch,
                validationErrors: validationWarnings.length > 0 ? validationWarnings : undefined,
            };
        }, {
            timeout: 30000, // 30 seconds timeout for complex invoice processing
            maxWait: 300000 // 5 minutes max wait
        });

        if (result.validationErrors?.length) {
            return {
                ...result,
                message: result.message.includes('descuadre') ? result.message : `${result.message} (Revisión requerida: descuadre detectado)`,
            };
        }

        return result;
    } catch (err) {
        const error = err as Error;

        // Handle unique constraint violations (P2002) - likely from concurrent batch processing
        if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {


            // Fetch the existing invoice to return its ID
            try {
                const user = await requireAuth();
                const provider = await prisma.provider.findFirst({
                    where: {
                        OR: [
                            { cif: extractedData.provider.cif ?? '' },
                            { name: extractedData.provider.name }
                        ],
                        userId: user.id,
                    },
                    select: { id: true, name: true }
                });

                if (provider) {
                    const existingInvoice = await prisma.invoice.findFirst({
                        where: {
                            invoiceCode: extractedData.invoiceCode,
                            providerId: provider.id
                        },
                        select: { id: true }
                    });

                    if (existingInvoice) {
                        return {
                            success: true, // Treat as success since invoice exists
                            message: `Invoice ${extractedData.invoiceCode} already processed (concurrent batch)`,
                            invoiceId: existingInvoice.id,
                            isDuplicate: false, // Not a user-facing duplicate
                        };
                    }
                }
            } catch (lookupError) {
                console.error(`[saveExtractedInvoice] Failed to lookup existing invoice after P2002:`, lookupError);
            }

            // If we can't find the invoice, return error but don't fail loudly
            return {
                success: true, // Still return success to avoid error banner
                message: `Invoice ${extractedData.invoiceCode} already processed by another batch`,
                isDuplicate: false,
            };
        }

        console.error(`[saveExtractedInvoice] Failed to persist invoice from batch output (file: ${fileName ?? "unknown"})`, {
            error: error.message,
            stack: error.stack,
            extractedData: extractedData
        });
        return {
            success: false,
            message: `Database error: ${error.message}`,
            fileName
        } as CreateInvoiceResult;
    }
}

export async function updateInvoiceAction(payload: UpdateInvoiceInput): Promise<UpdateInvoiceActionResult> {
    const user = await requireAuth();

    const validationErrors: string[] = [];

    if (!payload.invoiceId) {
        validationErrors.push('Identificador de factura no proporcionado.');
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        validationErrors.push('La factura debe contener al menos una línea.');
    }

    const parsedTotalAmount = Number(payload.totalAmount);
    if (!Number.isFinite(parsedTotalAmount)) {
        validationErrors.push('El total de la factura no es válido.');
    }

    interface NormalizedInvoiceUpdateItem {
        clientId: string;
        existingId: string | null;
        materialId: string | null;
        materialName: string;
        quantity: number;
        listPrice: number | null;
        discountPercentage: number | null;
        discountRaw: string | null;
        unitPrice: number;
        totalPrice: number;
        workOrder: string | null;
    }

    const normalizedItems = (payload.items ?? []).map<NormalizedInvoiceUpdateItem>((item, index) => {
        const rawId = typeof item.id === 'string' ? item.id.trim() : '';
        const clientId = rawId || `temp-${index}`;
        const existingId = rawId || null;

        const materialId = typeof item.materialId === 'string' && item.materialId.trim() !== ''
            ? item.materialId.trim()
            : null;

        const materialName = (item.materialName ?? '').trim();
        if (!materialName) {
            validationErrors.push(`La línea ${index + 1} debe tener un nombre de material.`);
        }

        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity)) {
            validationErrors.push(`La cantidad de la línea ${index + 1} no es válida.`);
        }

        const unitPrice = Number(item.unitPrice);
        if (!Number.isFinite(unitPrice)) {
            validationErrors.push(`El precio unitario de la línea ${index + 1} no es válido.`);
        }

        const totalPrice = Number(item.totalPrice);
        if (!Number.isFinite(totalPrice)) {
            validationErrors.push(`El total de la línea ${index + 1} no es válido.`);
        }

        const listPrice = item.listPrice === null || item.listPrice === undefined ? null : Number(item.listPrice);
        if (listPrice !== null && !Number.isFinite(listPrice)) {
            validationErrors.push(`El precio base de la línea ${index + 1} no es válido.`);
        }

        const discountPercentage = item.discountPercentage === null || item.discountPercentage === undefined
            ? null
            : Number(item.discountPercentage);
        if (discountPercentage !== null && !Number.isFinite(discountPercentage)) {
            validationErrors.push(`El descuento de la línea ${index + 1} no es válido.`);
        }

        const discountRaw = typeof item.discountRaw === 'string' && item.discountRaw.trim() !== ''
            ? item.discountRaw.trim()
            : null;
        const workOrder = typeof item.workOrder === 'string' && item.workOrder.trim() !== ''
            ? item.workOrder.trim()
            : null;

        return {
            clientId,
            existingId,
            materialId,
            materialName,
            quantity,
            listPrice,
            discountPercentage,
            discountRaw,
            unitPrice,
            totalPrice,
            workOrder,
        };
    });

    if (validationErrors.length > 0) {
        return {
            success: false,
            message: 'Errores de validación detectados.',
            hasTotalsMismatch: false,
            errors: validationErrors,
        };
    }

    const totalsCheck = evaluateTotalsMismatch(
        normalizedItems.map(item => ({ totalPrice: item.totalPrice })),
        parsedTotalAmount
    );

    try {
        const result = await prisma.$transaction(async (tx) => {
            const invoiceRecord = await tx.invoice.findFirst({
                where: {
                    id: payload.invoiceId,
                    provider: { userId: user.id },
                },
                include: {
                    provider: true,
                    items: {
                        include: { material: true },
                    },
                },
            });

            if (!invoiceRecord) {
                throw new Error('Factura no encontrada o sin permisos para editarla.');
            }

            const invoice = invoiceRecord as InvoiceWithProviderAndItems;
            const existingItemsMap = new Map(invoice.items.map(item => [item.id, item]));

            const deletedItemIds = Array.isArray(payload.deletedItemIds)
                ? payload.deletedItemIds
                    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
                    .map((id) => id.trim())
                : [];
            const deletedSet = new Set<string>(deletedItemIds);

            for (const id of deletedSet) {
                if (!existingItemsMap.has(id)) {
                    throw new Error(`La línea con id ${id} no pertenece a la factura.`);
                }
            }

            for (const item of normalizedItems) {
                if (item.existingId && deletedSet.has(item.existingId)) {
                    throw new Error('No se puede actualizar una línea marcada para eliminar.');
                }
            }

            const newItemsCount = normalizedItems.filter(
                (item) => !item.existingId || !existingItemsMap.has(item.existingId),
            ).length;
            const remainingExistingCount = invoice.items.length - deletedSet.size;
            const finalCount = remainingExistingCount + newItemsCount;

            if (finalCount <= 0) {
                throw new Error('La factura debe contener al menos una línea.');
            }

            const createdItems: (InvoiceItem & { material: Material })[] = [];

            for (const input of normalizedItems) {
                const existingItem = input.existingId ? existingItemsMap.get(input.existingId) : undefined;

                const quantityDecimal = new Prisma.Decimal(input.quantity.toFixed(3));
                const unitPriceDecimal = new Prisma.Decimal(input.unitPrice.toFixed(3));
                const totalPriceDecimal = new Prisma.Decimal(input.totalPrice.toFixed(3));
                const listPriceDecimal = input.listPrice !== null && input.listPrice !== undefined
                    ? new Prisma.Decimal(input.listPrice.toFixed(3))
                    : null;
                const discountPercentageDecimal = input.discountPercentage !== null && input.discountPercentage !== undefined
                    ? new Prisma.Decimal(input.discountPercentage.toFixed(2))
                    : null;

                if (existingItem) {
                    await tx.invoiceItem.update({
                        where: { id: existingItem.id },
                        data: {
                            quantity: quantityDecimal,
                            listPrice: listPriceDecimal,
                            discountPercentage: discountPercentageDecimal,
                            discountRaw: input.discountRaw ?? existingItem.discountRaw ?? null,
                            unitPrice: unitPriceDecimal,
                            totalPrice: totalPriceDecimal,
                            workOrder: input.workOrder,
                        },
                    });

                    const normalizedMaterialName = input.materialName;
                    if (normalizedMaterialName && normalizedMaterialName !== existingItem.material.name) {
                        await tx.material.update({
                            where: { id: existingItem.materialId },
                            data: {
                                name: normalizedMaterialName,
                            },
                        });
                    }

                    await syncMaterialPricingForInvoiceItem(tx, invoice, existingItem.materialId, unitPriceDecimal);
                    continue;
                }

                const normalizedMaterialName = input.materialName;
                let material: Material;

                if (input.materialId) {
                    const existingMaterial = await tx.material.findFirst({
                        where: {
                            id: input.materialId,
                            userId: invoice.provider.userId,
                        },
                    });

                    if (!existingMaterial) {
                        throw new Error('El material seleccionado para la nueva línea no existe o no pertenece al usuario.');
                    }

                    material = existingMaterial;
                } else {
                    material = await findOrCreateMaterialTx(
                        tx,
                        normalizedMaterialName,
                        undefined,
                        invoice.provider.type ?? undefined,
                        invoice.provider.userId ?? undefined,
                    );
                }

                if (normalizedMaterialName && normalizedMaterialName !== material.name) {
                    await tx.material.update({
                        where: { id: material.id },
                        data: {
                            name: normalizedMaterialName,
                        },
                    });
                    material = { ...material, name: normalizedMaterialName };
                }

                const created = await tx.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        materialId: material.id,
                        quantity: quantityDecimal,
                        listPrice: listPriceDecimal,
                        discountPercentage: discountPercentageDecimal,
                        discountRaw: input.discountRaw,
                        unitPrice: unitPriceDecimal,
                        totalPrice: totalPriceDecimal,
                        itemDate: invoice.issueDate,
                        workOrder: input.workOrder,
                    },
                    include: {
                        material: true,
                    },
                });

                createdItems.push(created);
                await syncMaterialPricingForInvoiceItem(tx, invoice, created.materialId, unitPriceDecimal);
            }

            if (deletedSet.size > 0) {
                const deletedItems = invoice.items.filter((item) => deletedSet.has(item.id));
                const deletedMaterialIds = new Set<string>(deletedItems.map((item) => item.materialId));

                await tx.invoiceItem.deleteMany({
                    where: {
                        id: { in: Array.from(deletedSet) },
                        invoiceId: invoice.id,
                    },
                });

                const remainingMaterialIds = new Set<string>();
                for (const item of invoice.items) {
                    if (!deletedSet.has(item.id)) {
                        remainingMaterialIds.add(item.materialId);
                    }
                }
                for (const item of createdItems) {
                    remainingMaterialIds.add(item.materialId);
                }

                const materialIdsToRemoveAlerts = Array.from(deletedMaterialIds).filter(
                    (materialId) => !remainingMaterialIds.has(materialId),
                );

                if (materialIdsToRemoveAlerts.length > 0) {
                    await tx.priceAlert.deleteMany({
                        where: {
                            invoiceId: invoice.id,
                            materialId: { in: materialIdsToRemoveAlerts },
                        },
                    });
                }
            }

            await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    totalAmount: new Prisma.Decimal(parsedTotalAmount.toFixed(2)),
                    hasTotalsMismatch: totalsCheck.hasMismatch,
                },
            });

            return {
                hasTotalsMismatch: totalsCheck.hasMismatch,
            };
        });

        await revalidatePath('/facturas');
        await revalidatePath(`/facturas/${payload.invoiceId}`);

        return {
            success: true,
            message: result.hasTotalsMismatch
                ? 'Factura actualizada. Aún existe un descuadre entre líneas y total.'
                : 'Factura actualizada correctamente.',
            hasTotalsMismatch: result.hasTotalsMismatch,
        };
    } catch (error) {
        console.error('[updateInvoiceAction] Error updating invoice', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'No se pudo actualizar la factura.',
            hasTotalsMismatch: totalsCheck.hasMismatch,
            errors: validationErrors.length > 0 ? validationErrors : undefined,
        };
    }
}

// ---------------------------------------------------------------------------
// 🚀  Server Action: kick off Batch job (returns immediately)
// ---------------------------------------------------------------------------

export async function startInvoiceBatch(formDataWithFiles: FormData): Promise<{ batchId: string }> {
    const files = formDataWithFiles.getAll('files') as File[];
    if (!files || files.length === 0) {
        throw new Error('No files provided.');
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
        throw new Error(`Too many files. Maximum allowed is ${MAX_FILES_PER_UPLOAD}.`);
    }
    const totalBytes = files.reduce((sum, f) => sum + (typeof f.size === 'number' ? f.size : 0), 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new Error(`Total upload size exceeds ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }

    // Filter invalid files early
    const validFiles = files.filter(f => validateUploadFile(f).valid);
    if (validFiles.length === 0) {
        throw new Error('No valid files to process. Ensure PDFs under the size limit.');
    }

    // Get authenticated user for batch ownership
    const user = await requireAuth();

    // 1️⃣  Generate a temporary id so the client can detect "batch mode". We do
    //     NOT persist it, thus it will not contribute to banner counts.
    const { randomUUID } = await import('crypto');
    const tempId = `temp-${randomUUID()}`;

    // 2️⃣  Launch heavy work in background (no await).
    void processBatchInBackground(validFiles, user.id).catch((err) => {
        console.error('[startInvoiceBatch] Background batch failed', err);
    });

    // 3️⃣  Return the temporary id immediately.
    return { batchId: tempId };
}

// ---------------------------------------------------------------------------
// 🏃‍♂️  Background worker — performs the heavy work and creates real Batch jobs
// ---------------------------------------------------------------------------

async function processBatchInBackground(files: File[], userId: string) {
    // Create an initial batch record that will be updated as processing happens
    let batchId: string | null = null;

    try {
        // STEP 0 – Upload PDFs to R2 for retry capability (if configured)
        const r2Keys: string[] = [];
        const r2Urls: Record<string, string> = {}; // Map fileName -> URL
        const r2Enabled = isR2Configured();

        if (r2Enabled) {
            console.log('[processBatchInBackground] R2 configured, uploading PDFs for permanent storage');
            // Create temporary batch ID for R2 organization
            const tempBatchId = `batch-${Date.now()}`;

            try {
                const uploadPromises = files.map(async (file) => {
                    const result = await uploadPdfToR2(file, tempBatchId);
                    r2Urls[file.name] = result.url;
                    return result.key;
                });
                const keys = await Promise.all(uploadPromises);
                r2Keys.push(...keys);
                console.log(`[processBatchInBackground] Uploaded ${r2Keys.length} PDFs to R2 for permanent storage`);
            } catch (r2Error) {
                console.error('[processBatchInBackground] Failed to upload PDFs to R2:', r2Error);
                // Continue without retry capability if R2 upload fails
            }
        } else {
            console.log('[processBatchInBackground] R2 not configured, skipping PDF upload (no retry capability)');
        }

        // STEP A – Build JSONL chunks
        const tmpDir = path.join(process.env.NODE_ENV === 'development' ? path.join(process.cwd(), 'tmp') : os.tmpdir(), 'facturas-batch');
        try {
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true, mode: 0o755 });
            }
        } catch (mkdirError) {
            const errorMsg = mkdirError instanceof Error ? mkdirError.message : 'Unknown error creating tmp directory';
            console.error('[processBatchInBackground] Failed to create tmp directory:', mkdirError);
            throw new Error(`Failed to create temporary directory: ${errorMsg}`);
        }

        const chunks = await buildBatchJsonlChunks(files);
        if (chunks.length === 0) {
            throw new Error('No JSONL chunks built.');
        }

        let isFirstChunk = true;

        for (const [index, chunk] of chunks.entries()) {
            const jsonlPath = path.join(tmpDir, `gemini-batch-${Date.now()}-${index}.jsonl`);
            await fs.promises.writeFile(jsonlPath, chunk.content, 'utf8');

            // Upload file to Gemini with retry logic
            let uploaded: { name?: string; id?: string } | undefined;
            let uploadAttempts = 0;
            while (uploadAttempts < 3) {
                try {
                    uploaded = await gemini.files.upload({
                        file: jsonlPath,
                        config: { displayName: `invoices-${Date.now()}-${index}`, mimeType: 'application/json' }
                    }) as unknown as { name?: string; id?: string };
                    break;
                } catch (error: unknown) {
                    uploadAttempts++;
                    if (uploadAttempts >= 3) throw error;
                    if (isRateLimitError(error)) {
                        console.log(`[processBatchInBackground] Rate limit hit during file upload, waiting 2s before retry ${uploadAttempts}/3`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        throw error;
                    }
                }
            }

            // Create Gemini batch job with retry logic
            let created: { name: string } | undefined;
            let batchAttempts = 0;
            // Ensure we have a valid file identifier from the upload response
            const fileIdentifier = (uploaded as { name?: string; id?: string } | undefined)?.name;
            if (!fileIdentifier) {
                throw new Error('[processBatchInBackground] Gemini file upload did not return a valid file identifier (name or id)');
            }
            while (batchAttempts < 3) {
                try {
                    created = await gemini.batches.create({
                        model: GEMINI_MODEL,
                        src: fileIdentifier,
                        config: { displayName: `invoice-job-${Date.now()}-${index}` }
                    }) as unknown as { name: string };
                    break;
                } catch (error: unknown) {
                    batchAttempts++;
                    if (batchAttempts >= 3) throw error;
                    if (isRateLimitError(error)) {
                        console.log(`[processBatchInBackground] Rate limit hit during batch creation, waiting 1s before retry ${batchAttempts}/3`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw error;
                    }
                }
            }

            const remoteId: string = created?.name || 'unknown';
            console.log(`[processBatchInBackground] Created Gemini batch ${remoteId} for chunk ${index + 1}/${chunks.length} (${chunk.files.length} files)`);

            // On the first chunk, create the local batch record using the Gemini batch ID
            if (isFirstChunk && remoteId !== 'unknown') {
                batchId = await createBatchProcessing(files.length, remoteId, userId);
                isFirstChunk = false;

                // Save R2 keys to database for retry capability
                if (r2Keys.length > 0) {
                    await prisma.batchProcessing.update({
                        where: { id: batchId },
                        data: { r2Keys: r2Keys },
                    });
                }

                // Update to PROCESSING state
                await updateBatchProgress(batchId, {
                    status: 'PROCESSING',
                    startedAt: new Date(),
                });
            }

            // Cleanup temp file in background (don't block loop)
            fs.promises.unlink(jsonlPath).catch(() => undefined);

        }
    } catch (err) {
        console.error('[processBatchInBackground] Failed to enqueue batches', err);

        // If we created a batch record, update it with the error so the user sees it
        if (batchId) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error during batch processing';
            await updateBatchProgress(batchId, {
                status: 'FAILED',
                errors: [
                    {
                        kind: 'DATABASE_ERROR',
                        message: errorMsg,
                        timestamp: new Date().toISOString(),
                    },
                ],
                completedAt: new Date(),
                failedFiles: files.length,
            }).catch((updateErr) => {
                console.error('[processBatchInBackground] Failed to update batch record with error:', updateErr);
            });
        }
    } finally {
        // Clean up temporary directory after processing
        try {
            const tmpDir = path.join(os.tmpdir(), 'facturas-batch');
            if (fs.existsSync(tmpDir)) {
                const files = await fs.promises.readdir(tmpDir);
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                for (const file of files) {
                    try {
                        const filePath = path.join(tmpDir, file);
                        const stats = await fs.promises.stat(filePath);
                        //do not delete in development to allow inspection
                        if (process.env.NODE_ENV !== 'development') {
                            if (stats.isFile() && stats.mtime.getTime() < oneHourAgo) {
                                await fs.promises.unlink(filePath);
                                console.log(`[processBatchInBackground] Cleaned up old tmp file: ${file}`);
                            }
                        }
                    } catch { }
                }
            }
        } catch (cleanupErr) {
            console.warn('[processBatchInBackground] Failed to cleanup tmp directory:', cleanupErr);
        }
    }
}

// ---------------------------------------------------------------------------
// Helper to download and persist results of a completed batch
// ---------------------------------------------------------------------------

interface GeminiInlineResponse { key?: string; response?: { text?: string }; error?: unknown }
type GeminiDest = { file_name?: string; fileName?: string; inlined_responses?: Array<GeminiInlineResponse>; inlinedResponses?: Array<GeminiInlineResponse> } | undefined | null;

// Helper to detect Gemini timeout errors
function isGeminiTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as { code?: number; message?: string };
    // Check for timeout error code or timeout message
    if (e.code === 4) return true;
    if (typeof e.message === 'string') {
        const msg = e.message.toLowerCase();
        return msg.includes('timeout') || msg.includes('timed out');
    }
    return false;
}

// Helper to retry Gemini API calls with exponential backoff
async function retryGeminiOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = 2000
): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Only retry on timeout errors
            if (!isGeminiTimeoutError(error)) {
                throw error;
            }

            if (attempt < maxRetries) {
                const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                console.log(`[retryGeminiOperation] Timeout on attempt ${attempt}/${maxRetries}, retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                console.error(`[retryGeminiOperation] All ${maxRetries} attempts failed with timeout`);
            }
        }
    }

    throw lastError;
}

export async function ingestBatchOutputFromGemini(batchId: string, dest: GeminiDest) {
    // Supports file-based dest or inlined_responses
    if (dest && (dest.file_name || dest.fileName)) {
        const fileName: string = (dest.file_name ?? dest.fileName) as string;
        console.log(`[ingestBatchOutput] Downloading Gemini output for batch ${batchId} (file ${fileName})`);
        const tmpDir = path.join(process.env.NODE_ENV === 'development' ? path.join(process.cwd(), 'tmp') : os.tmpdir(), 'facturas-batch');
        try {
            await fs.promises.mkdir(tmpDir, { recursive: true, mode: 0o755 });
        } catch (mkdirError) {
            const errorMsg = mkdirError instanceof Error ? mkdirError.message : 'Unknown error creating tmp directory';
            console.error(`[ingestBatchOutput] Failed to create tmp directory for batch ${batchId}:`, mkdirError);
            await updateBatchProgress(batchId, {
                status: 'FAILED',
                errors: [
                    {
                        kind: 'DATABASE_ERROR',
                        message: `Failed to create temporary directory: ${errorMsg}`,
                        timestamp: new Date().toISOString(),
                    },
                ],
                completedAt: new Date(),
            });
            return;
        }
        let downloadedPath: string;
        try {
            downloadedPath = path.join(tmpDir, path.basename(fileName));

            // Wrap download operation with retry logic for timeout resilience
            await retryGeminiOperation(async () => {
                console.log(`[ingestBatchOutput] Attempting to download batch results file: ${fileName}`);
                await gemini.files.download({ file: fileName as unknown as string, downloadPath: downloadedPath });
            }, 3, 3000); // 3 retries with 3 second initial delay

            // Wait for the file to be fully downloaded with retry logic
            const maxWaitTime = 60000; // 60 seconds max wait
            const checkInterval = 500; // Check every 500ms
            const startTime = Date.now();
            let fileReady = false;
            let lastSize = -1;
            let stableSizeCount = 0;

            while (Date.now() - startTime < maxWaitTime) {
                try {
                    const stats = await fs.promises.stat(downloadedPath);
                    if (stats.isFile()) {
                        // Check if file size is stable (hasn't changed for 2 consecutive checks)
                        if (stats.size === lastSize && stats.size > 0) {
                            stableSizeCount++;
                            if (stableSizeCount >= 2) {
                                fileReady = true;
                                console.log(`[ingestBatchOutput] File download verified: ${downloadedPath} (${stats.size} bytes)`);
                                break;
                            }
                        } else {
                            stableSizeCount = 0;
                        }
                        lastSize = stats.size;
                    }
                } catch (err) {
                    // File doesn't exist yet, continue waiting
                }
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }

            if (!fileReady) {
                console.warn(`[ingestBatchOutput] File download timeout or unstable for ${downloadedPath}, attempting to proceed anyway`);
            }

            if (!await fs.promises.access(downloadedPath).then(() => true).catch(() => false)) {
                try {
                    const files = await fs.promises.readdir(tmpDir);
                    console.log(`[ingestBatchOutput] Expected file: ${downloadedPath}, Available files: ${files.join(', ')}`);
                    const fileStats = await Promise.all(files.map(async (file) => {
                        try { const fullPath = path.join(tmpDir, file); const stats = await fs.promises.stat(fullPath); return { file, fullPath, mtime: stats.mtime, isFile: stats.isFile() }; }
                        catch { return null; }
                    }));
                    const validFiles = fileStats.filter(s => s !== null && s.isFile) as Array<{ file: string; fullPath: string; mtime: Date; isFile: boolean; }>;
                    const expectedBaseName = path.basename(fileName);
                    const matchingFiles = validFiles.filter(f => f.file === expectedBaseName || f.file.includes(expectedBaseName.split('.')[0]));
                    const recentJsonlFiles = validFiles.filter(f => f.file.endsWith('.jsonl') && (Date.now() - f.mtime.getTime()) < 10 * 60 * 1000);
                    let selectedFile: typeof validFiles[0] | null = null;
                    if (matchingFiles.length > 0) {
                        selectedFile = matchingFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
                        console.log(`[ingestBatchOutput] Using matching file: ${selectedFile.file}`);
                    } else if (recentJsonlFiles.length === 1) {
                        selectedFile = recentJsonlFiles[0];
                        console.log(`[ingestBatchOutput] Using recent .jsonl file: ${selectedFile.file}`);
                    } else if (recentJsonlFiles.length > 1) {
                        throw new Error(`Multiple recent .jsonl files found, cannot determine which belongs to batch ${batchId}. Files: ${recentJsonlFiles.map(f => f.file).join(', ')}`);
                    } else {
                        throw new Error(`No suitable batch result file found for batch ${batchId}. Expected: ${expectedBaseName}, Available: ${files.join(', ')}`);
                    }
                    downloadedPath = selectedFile.fullPath;
                    console.log(`[ingestBatchOutput] Selected file: ${downloadedPath}`);
                } catch (dirErr) {
                    throw new Error(`Failed to process tmp directory ${tmpDir}: ${dirErr instanceof Error ? dirErr.message : 'Unknown error'}`);
                }
            }
            try { const stats = await fs.promises.stat(downloadedPath); if (stats.isDirectory()) { throw new Error(`Downloaded path ${downloadedPath} is a directory, not a file`); } }
            catch (statErr) { throw new Error(`Cannot access file stats for ${downloadedPath}: ${statErr instanceof Error ? statErr.message : 'Unknown error'}`); }
            console.log(`[ingestBatchOutput] Using streaming parser for ${downloadedPath}`);
            const parsedLines = await parseJsonLinesFromFile(downloadedPath);
            const processingResult = await processOutputLines(parsedLines);

            // Clean up the downloaded file only if there are no actual errors (i.e., only duplicates or complete success)
            // Keep the file if there are actual errors for debugging
            if (!processingResult.hasActualErrors && process.env.NODE_ENV !== 'development') {
                try {
                    await fs.promises.unlink(downloadedPath);
                    console.log(`[ingestBatchOutput] Cleaned up downloaded result file: ${downloadedPath} (${processingResult.hasOnlyDuplicates ? 'only duplicates' : 'no errors'})`);
                } catch (cleanupErr) {
                    console.warn(`[ingestBatchOutput] Failed to clean up downloaded result file ${downloadedPath}:`, cleanupErr);
                }
            } else {
                console.log(`[ingestBatchOutput] Keeping failed batch result file for debugging: ${downloadedPath} (${processingResult.successCount} success, ${processingResult.failedCount} failed with actual errors)`);
            }

            // Clean up old temporary files (older than 1 hour)
            try {
                const files = await fs.promises.readdir(tmpDir);
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                for (const file of files) {
                    try {
                        const filePath = path.join(tmpDir, file);
                        const stats = await fs.promises.stat(filePath);
                        if (stats.isFile() && stats.mtime.getTime() < oneHourAgo) {
                            await fs.promises.unlink(filePath);
                            console.log(`[ingestBatchOutput] Cleaned up old tmp file: ${file}`);
                        }
                    } catch { }
                }
            } catch { }
        } catch (error) {
            console.error(`[ingestBatchOutput] Error downloading or processing batch results for ${batchId}:`, error);
            throw error;
        }
    } else if (dest && (dest.inlined_responses || dest.inlinedResponses)) {
        const inlined = (dest.inlined_responses ?? dest.inlinedResponses) as Array<GeminiInlineResponse>;
        const parsedLines = inlined.map((r) => ({ ...r }));
        // For inlined responses, we don't have a file to clean up, so we don't need the result
        await processOutputLines(parsedLines);
    } else {
        console.warn(`[ingestBatchOutput] Gemini batch ${batchId} has no dest results`);
    }

    interface ErrorContext {
        custom_id?: string;
        status_code?: number;
        hasChoices?: boolean;
        rawContent?: string;
        rawLine?: string;
        extractedData?: ExtractedPdfData;
        result?: CreateInvoiceResult;
        itemsExtracted?: number;
        finishReason?: string;
        batchError?: BatchErrorDetail;
    }

    async function processOutputLines(entries: unknown[]): Promise<{ hasActualErrors: boolean; hasOnlyDuplicates: boolean; totalProcessed: number; successCount: number; failedCount: number }> {
        let success = 0;
        let failed = 0;
        const errors: Array<{ lineIndex: number; error: string; context?: ErrorContext }> = [];
        let duplicateErrors = 0;
        let actualErrors = 0;

        // Get R2 keys and map to URLs for saving with invoices
        const batch = await prisma.batchProcessing.findUnique({
            where: { id: batchId },
            select: { r2Keys: true },
        });
        const r2Keys = (batch?.r2Keys as string[] | null) || [];

        // Create a map of fileName -> URL for quick lookup
        const fileUrlMap = new Map<string, string>();
        if (r2Keys.length > 0) {
            for (const key of r2Keys) {
                const fileName = key.split('/').pop();
                if (fileName) {
                    const url = getPdfUrlFromKey(key);
                    if (url) fileUrlMap.set(fileName, url);
                }
            }
        }

        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const lineIndex = index + 1;
            try {
                const parsedObj = entry as Record<string, unknown> | null;
                if (!parsedObj || typeof parsedObj !== 'object') {
                    const errorMsg = 'Entry is not an object';
                    console.error(`[ingestBatchOutput] ${errorMsg} at line ${lineIndex}`);
                    errors.push({ lineIndex, error: errorMsg });
                    failed++;
                    actualErrors++;
                    continue;
                }
                const response = parsedObj.response as Record<string, unknown> | undefined;
                const errorPayload = parsedObj.error as unknown;
                const key = (parsedObj.key as string) ?? (parsedObj.custom_id as string) ?? 'unknown';

                if (errorPayload) {
                    const errorMsg = `Gemini request failed: ${JSON.stringify(errorPayload)}`;
                    console.error(`[ingestBatchOutput] ${errorMsg} (key: ${key})`);
                    errors.push({ lineIndex, error: errorMsg, context: { custom_id: key } });
                    failed++;
                    actualErrors++;
                    continue;
                }

                let content: string | undefined;
                let finishReason: string | undefined;
                if (response) {
                    const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
                    const firstCandidate = candidates?.[0];
                    finishReason = firstCandidate?.finishReason as string | undefined;

                    // Check for MAX_TOKENS early - skip processing entirely to avoid wasted effort
                    if (finishReason === 'MAX_TOKENS') {
                        const errorMsg = 'Response truncated due to MAX_TOKENS - invoice cannot be processed in batch mode';
                        console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (key: ${key})`);
                        errors.push({
                            lineIndex,
                            error: errorMsg,
                            context: { custom_id: key, finishReason: 'MAX_TOKENS' }
                        });
                        failed++;
                        actualErrors++;
                        continue; // Skip processing this invoice entirely
                    }

                    const contentObj = firstCandidate?.content as Record<string, unknown> | undefined;
                    const parts = contentObj?.parts as Array<Record<string, unknown>> | undefined;
                    if (Array.isArray(parts)) {
                        content = parts
                            .map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? ((p as { text?: string }).text) : ''))
                            .join('');
                    }
                    const respText = (response as { text?: unknown }).text;
                    if ((!content || content.length === 0) && typeof respText === 'string') {
                        content = respText;
                    }
                }

                if (!content || content.length === 0) {
                    const errorMsg = finishReason === 'MAX_TOKENS'
                        ? 'Response truncated due to MAX_TOKENS and no content extracted'
                        : 'No content in Gemini response';
                    console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (key: ${key})`);
                    errors.push({ lineIndex, error: errorMsg, context: { custom_id: key } });
                    failed++;
                    actualErrors++;
                    continue;
                }

                const extractedData = parseTextBasedExtraction(content);
                if (!extractedData) {
                    const errorMsg = `Failed to parse text-based extracted data`;
                    const identifier = key ?? 'unknown';
                    console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (id: ${identifier})`);
                    console.error(`[ingestBatchOutput] Raw content: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
                    errors.push({
                        lineIndex,
                        error: errorMsg,
                        context: { custom_id: identifier, rawContent: content.substring(0, 500) }
                    });
                    failed++;
                    actualErrors++;
                    continue;
                }

                // Get PDF URL for this file from map
                const pdfUrl = fileUrlMap.get(key || '') || undefined;
                let result = await saveExtractedInvoice(extractedData, key ?? undefined, pdfUrl);

                // 🔄 Retry system: If mismatch detected and R2 is available, retry up to 3 more times
                // Note: Retry even if success=true because we want to fix the mismatch
                if (result.hasTotalsMismatch) {
                    console.log(`[Retry] Descuadre detectado en ${key}, verificando si es posible reintentar...`);

                    try {
                        // Get R2 keys from batch
                        const batch = await prisma.batchProcessing.findUnique({
                            where: { id: batchId },
                            select: { r2Keys: true, retryAttempts: true, retriedFiles: true },
                        });

                        const r2Keys = (batch?.r2Keys as string[] | null) || [];
                        const pdfKey = r2Keys.find(k => k.endsWith(key || ''));

                        if (pdfKey) {
                            let retrySuccess = false;
                            let finalResult = result;
                            const invoiceIdToDelete = result.invoiceId; // Save ID if we need to delete and recreate

                            // Up to 3 additional retry attempts (attempts 2, 3, 4)
                            for (let attempt = 2; attempt <= 4 && !retrySuccess; attempt++) {
                                console.log(`[Retry] Intento ${attempt}/4 para ${key}...`);

                                try {
                                    // Download PDF from R2
                                    const retryFile = await downloadPdfFromR2(pdfKey);

                                    // Re-extract with enhanced prompt (attempt number)
                                    const retryExtraction = await callPdfExtractAPI(retryFile, []);

                                    if (retryExtraction.extractedData && !retryExtraction.error) {
                                        // If first retry attempt succeeded in saving, delete the old invoice with mismatch
                                        if (attempt === 2 && invoiceIdToDelete && result.success) {
                                            try {
                                                await prisma.invoice.delete({
                                                    where: { id: invoiceIdToDelete }
                                                });
                                                console.log(`[Retry] Factura antigua con descuadre eliminada: ${invoiceIdToDelete}`);
                                            } catch (deleteError) {
                                                console.error(`[Retry] Error eliminando factura antigua:`, deleteError);
                                            }
                                        }

                                        // Try to save new extraction (reuse same PDF URL)
                                        const retryResult = await saveExtractedInvoice(
                                            retryExtraction.extractedData,
                                            key,
                                            pdfUrl
                                        );

                                        if (retryResult.success && !retryResult.hasTotalsMismatch) {
                                            console.log(`[Retry] ✓ Éxito en intento ${attempt} para ${key}`);
                                            finalResult = retryResult;
                                            retrySuccess = true;

                                            // Update retry statistics
                                            await prisma.batchProcessing.update({
                                                where: { id: batchId },
                                                data: {
                                                    retryAttempts: { increment: attempt - 1 },
                                                    retriedFiles: { increment: 1 },
                                                },
                                            });
                                        } else if (retryResult.hasTotalsMismatch) {
                                            console.log(`[Retry] Intento ${attempt} aún tiene descuadre para ${key}`);
                                            // If this retry also has mismatch but was saved, delete it for next attempt
                                            if (retryResult.success && retryResult.invoiceId) {
                                                try {
                                                    await prisma.invoice.delete({
                                                        where: { id: retryResult.invoiceId }
                                                    });
                                                } catch (deleteError) {
                                                    console.error(`[Retry] Error eliminando reintento con descuadre:`, deleteError);
                                                }
                                            }
                                            finalResult = retryResult;
                                        }
                                    }
                                } catch (retryError) {
                                    console.error(`[Retry] Error en intento ${attempt} para ${key}:`, retryError);
                                }

                                // Wait before next attempt (exponential backoff)
                                if (!retrySuccess && attempt < 4) {
                                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                                }
                            }

                            if (!retrySuccess) {
                                console.warn(`[Retry] Agotados reintentos para ${key}, usando último resultado`);
                            }

                            // Use final result (either successful retry or last attempt)
                            result = finalResult;
                        } else {
                            console.log(`[Retry] No se encontró PDF en R2 para ${key}, omitiendo reintentos`);
                        }
                    } catch (retryError) {
                        console.error(`[Retry] Error durante sistema de reintentos:`, retryError);
                        // Continue with original result if retry system fails
                    }
                }

                if (result.success) {
                    success++;
                    if (result.validationErrors?.length) {
                        for (const warning of result.validationErrors) {
                            errors.push({
                                lineIndex,
                                error: warning.message,
                                context: { batchError: warning, result },
                            });
                            actualErrors++;
                        }
                    }
                } else {
                    // Check if this is a duplicate invoice error (check message content for backward compatibility with old results)
                    const isDuplicateError = result.isDuplicate ||
                        result.message?.includes('Factura Duplicada') ||
                        result.message?.includes('already exists') ||
                        result.message?.includes('ya existe');

                    // For duplicates, use the message as-is; for other errors, add descriptive prefix
                    const errorMsg = isDuplicateError
                        ? result.message
                        : `Error al guardar la factura: ${result.message}`;

                    console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (key: ${key ?? 'unknown'})`);
                    errors.push({
                        lineIndex,
                        error: errorMsg,
                        context: { custom_id: key, result }
                    });
                    failed++;

                    if (isDuplicateError) {
                        duplicateErrors++;
                    } else {
                        actualErrors++;
                    }
                }
            } catch (err) {
                const errorMsg = `Error al procesar la línea: ${(err as Error).message}`;
                console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex}`);
                errors.push({
                    lineIndex,
                    error: errorMsg,
                    context: { rawLine: JSON.stringify(entry).substring(0, 500) }
                });
                failed++;
                actualErrors++;
            }
        }

        await updateBatchProgress(batchId, {
            successfulFiles: success,
            failedFiles: failed,
            processedFiles: success + failed,
            completedAt: new Date(),
        });

        console.log(`[ingestBatchOutput] Persisted ${success} invoices, ${failed} errors for batch ${batchId}`);

        // Note: PDFs are now stored permanently in R2 for viewing in the UI
        // No automatic cleanup - files remain accessible via invoice detail pages

        if (errors.length > 0) {
            // Filter out descuadre validation errors from console.error logging
            const errorsToLog = errors.filter(({ context }) => {
                const batchError = context?.batchError;
                return batchError?.kind !== 'VALIDATION_ERROR';
            });

            if (errorsToLog.length > 0) {
                console.error(`[ingestBatchOutput] Detailed errors for batch ${batchId}:`);
                errorsToLog.forEach(({ lineIndex, error, context }) => {
                    console.error(`  Line ${lineIndex}: ${error}`);
                    if (context) {
                        console.error(`    Context:`, context);
                    }
                });
            }

            const structuredErrors = errors.map(({ lineIndex, error, context }) => {
                const fileName = context?.custom_id || `line-${lineIndex}`;
                const maybeResult = context?.result as CreateInvoiceResult | undefined;
                const directBatchError = context?.batchError;

                // Detect if this is a duplicate error
                const isDuplicateError = maybeResult?.isDuplicate ||
                    maybeResult?.message?.includes('Factura Duplicada') ||
                    maybeResult?.message?.includes('already exists') ||
                    maybeResult?.message?.includes('ya existe');

                // Extract invoice code from various message formats
                let invoiceCode: string | undefined;

                // First try to get from extracted data
                if (context?.extractedData && typeof context.extractedData === 'object') {
                    invoiceCode = (context.extractedData as ExtractedPdfData).invoiceCode;
                }

                // For old format duplicates: "filename.pdf: La factura INVOICECODE ya existe para el proveedor..."
                if (!invoiceCode && isDuplicateError && maybeResult?.message) {
                    const oldFormatMatch = maybeResult.message.match(/La factura ([^y]+) ya existe/);
                    if (oldFormatMatch) {
                        invoiceCode = oldFormatMatch[1].trim();
                    }
                }

                // For new format duplicates: "Factura Duplicada - INVOICECODE - filename"
                if (!invoiceCode && maybeResult?.message?.includes('Factura Duplicada')) {
                    const newFormatMatch = maybeResult.message.match(/^Factura Duplicada - (.+?) - /);
                    if (newFormatMatch) {
                        invoiceCode = newFormatMatch[1];
                    }
                }

                // Fallback: try to extract from generic invoice messages
                if (!invoiceCode && maybeResult?.message?.includes('Invoice')) {
                    const invoiceMatch = maybeResult.message.match(/Invoice\s+([^\s]+)/);
                    if (invoiceMatch) {
                        invoiceCode = invoiceMatch[1];
                    }
                }

                if (directBatchError) {
                    return {
                        ...directBatchError,
                        fileName: directBatchError.fileName ?? fileName,
                        invoiceCode: directBatchError.invoiceCode ?? invoiceCode,
                        timestamp: directBatchError.timestamp ?? new Date().toISOString(),
                    } satisfies BatchErrorDetail;
                }

                const kind: BatchErrorDetail['kind'] = context?.rawLine
                    ? 'PARSING_ERROR'
                    : isDuplicateError
                        ? 'DUPLICATE_INVOICE'
                        : maybeResult
                            ? 'DATABASE_ERROR'
                            : 'UNKNOWN';

                // Format message: for duplicates, use clean format; for others, use error as-is
                let finalMessage: string;
                if (isDuplicateError) {
                    // If already in new format, use as-is; otherwise convert old format to new format
                    if (maybeResult?.message?.includes('Factura Duplicada')) {
                        finalMessage = maybeResult.message;
                    } else {
                        // Convert old format to new format
                        finalMessage = `Factura Duplicada - ${invoiceCode || 'Desconocido'} - ${fileName}`;
                    }
                } else {
                    finalMessage = error;
                }

                return {
                    kind,
                    message: finalMessage,
                    fileName,
                    invoiceCode,
                    timestamp: new Date().toISOString(),
                } satisfies BatchErrorDetail;
            }).slice(0, 100);

            await updateBatchProgress(batchId, {
                errors: structuredErrors,
            });
        }

        // Return detailed error information for cleanup decision
        return {
            hasActualErrors: actualErrors > 0,
            hasOnlyDuplicates: errors.length > 0 && actualErrors === 0 && duplicateErrors > 0,
            totalProcessed: entries.length,
            successCount: success,
            failedCount: failed
        };
    }
}

// ---------------------------------------------------------------------------
// 🛑  Server Action: Cancel all active batches
// ---------------------------------------------------------------------------

export async function cancelAllBatches(): Promise<{ success: boolean; message: string; cancelledCount: number }> {
    const user = await requireAuth();

    try {
        // Get all active batches for this user
        const activeBatches = await prisma.batchProcessing.findMany({
            where: {
                userId: user.id,
                status: {
                    in: ['PENDING', 'PROCESSING']
                }
            }
        });

        if (activeBatches.length === 0) {
            return {
                success: true,
                message: 'No active batches to cancel.',
                cancelledCount: 0
            };
        }

        let cancelledCount = 0;

        for (const batch of activeBatches) {
            try {
                // Call Gemini API to cancel the batch
                await gemini.batches.cancel({ name: batch.id });

                // Update batch status in database
                await updateBatchProgress(batch.id, {
                    status: 'CANCELLED',
                    completedAt: new Date(),
                });

                cancelledCount++;
            } catch (error) {
                console.error(`Failed to cancel batch ${batch.id}:`, error);
                // Continue with other batches even if one fails
            }
        }

        const message = cancelledCount === activeBatches.length
            ? `Successfully cancelled ${cancelledCount} batch(es).`
            : `Cancelled ${cancelledCount} out of ${activeBatches.length} batch(es). Some batches may have already completed.`;

        return {
            success: true,
            message,
            cancelledCount
        };
    } catch (error) {
        console.error('Error cancelling batches:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred while cancelling batches',
            cancelledCount: 0
        };
    }
} 