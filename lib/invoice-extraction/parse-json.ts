import type { ExtractedPdfData, ExtractedPdfItemData } from '@/lib/types/pdf';
import { calculateCombinedDiscount } from '@/lib/invoice-extraction/discount';
import { validateAndFixDate } from '@/lib/invoice-extraction/dates';
import { parseJsonSafe } from '@/lib/invoice-extraction/parse-json-safe';
import {
    extractedInvoiceZodSchema,
    extractedItemsOnlyZodSchema,
    type ExtractedInvoiceJson,
} from '@/lib/invoice-extraction/schema';
import {
    applyConservativeNameCodeSwap,
    validateExtractedItems,
    type ItemValidationIssue,
} from '@/lib/invoice-extraction/validate-items';
import { normalizeExtractedInvoice } from '@/lib/invoice-extraction/normalize-extraction';

function normalizeOptionalString(value: string | null | undefined): string | undefined {
    if (value === null || value === undefined) return undefined;
    const t = String(value).trim();
    if (!t || t.toLowerCase() === 'null' || t === '~') return undefined;
    return t;
}

function normalizeItem(raw: ExtractedInvoiceJson['items'][number], index: number): ExtractedPdfItemData {
    let quantity = Number(raw.quantity);
    if (isNaN(quantity)) quantity = 0;

    let unitPrice = Number(raw.unitPrice);
    if (isNaN(unitPrice)) unitPrice = 0;

    let totalPrice = Number(raw.totalPrice);
    if (isNaN(totalPrice)) totalPrice = 0;

    const discountRaw = normalizeOptionalString(raw.discountRaw) ?? '0';
    const discountPercentage = calculateCombinedDiscount(discountRaw);

    quantity = Number(quantity.toFixed(3));
    unitPrice = Number(unitPrice.toFixed(3));
    totalPrice = Number(totalPrice.toFixed(3));

    let listPrice = unitPrice;
    if (discountPercentage > 0 && discountPercentage < 100) {
        listPrice = Number((unitPrice / (1 - discountPercentage / 100)).toFixed(3));
    }

    const rawItemDate = normalizeOptionalString(raw.itemDate);

    let item: ExtractedPdfItemData = {
        materialName: String(raw.materialName ?? '').trim(),
        materialCode: normalizeOptionalString(raw.materialCode),
        isMaterial: raw.isMaterial !== false,
        quantity,
        listPrice,
        discountPercentage,
        discountRaw,
        unitPrice,
        totalPrice,
        itemDate: rawItemDate ? validateAndFixDate(rawItemDate) : undefined,
        workOrder: normalizeOptionalString(raw.workOrder),
        description: normalizeOptionalString(raw.description),
        lineNumber: typeof raw.lineNumber === 'number' ? raw.lineNumber : index + 1,
    };

    item = applyConservativeNameCodeSwap(item);
    return item;
}

function mapInvoiceJson(parsed: ExtractedInvoiceJson): ExtractedPdfData {
    const items = parsed.items.map((row, i) => normalizeItem(row, i));

    return normalizeExtractedInvoice({
        invoiceCode: parsed.invoiceCode.trim(),
        issueDate: validateAndFixDate(parsed.issueDate.trim()),
        totalAmount: Number(parsed.totalAmount),
        ivaPercentage: typeof parsed.ivaPercentage === 'number' ? parsed.ivaPercentage : 21,
        retentionAmount: typeof parsed.retentionAmount === 'number' ? parsed.retentionAmount : 0,
        provider: {
            name: parsed.provider.name.trim(),
            cif: parsed.provider.cif.trim(),
            email: normalizeOptionalString(parsed.provider.email),
            phone: normalizeOptionalString(parsed.provider.phone),
            address: normalizeOptionalString(parsed.provider.address),
        },
        items,
    });
}

export interface ParseJsonResult {
    data: ExtractedPdfData | null;
    zodError?: string;
    validationIssues?: ItemValidationIssue[];
}

export function parseGeminiJsonExtraction(text: string): ParseJsonResult {
    const raw = parseJsonSafe(text);
    if (!raw) {
        return { data: null, zodError: 'Could not parse JSON' };
    }

    const zod = extractedInvoiceZodSchema.safeParse(raw);
    if (!zod.success) {
        return { data: null, zodError: zod.error.message };
    }

    const data = mapInvoiceJson(zod.data);
    const validationIssues = validateExtractedItems(data.items);

    if (validationIssues.length > 0) {
        return { data: null, validationIssues };
    }

    if (!data.invoiceCode || !data.provider?.cif || !data.issueDate || isNaN(data.totalAmount)) {
        return { data: null, zodError: 'Missing required invoice-level fields' };
    }

    if (data.items.length === 0) {
        return { data: null, zodError: 'No line items in JSON' };
    }

    return { data };
}

export function parseGeminiItemsOnlyJson(text: string): ExtractedPdfItemData[] | null {
    const raw = parseJsonSafe(text);
    if (!raw) return null;

    const zod = extractedItemsOnlyZodSchema.safeParse(raw);
    if (!zod.success) return null;

    return zod.data.items.map((row, i) => normalizeItem(row, i));
}

export function mergeExtractedItems(
    base: ExtractedPdfData,
    additional: ExtractedPdfItemData[],
): ExtractedPdfData {
    const byLine = new Map<number, ExtractedPdfItemData>();

    for (const item of base.items) {
        const key = item.lineNumber ?? 0;
        byLine.set(key, item);
    }

    for (const item of additional) {
        const key = item.lineNumber ?? byLine.size + 1;
        if (!byLine.has(key)) {
            byLine.set(key, item);
        }
    }

    const merged = Array.from(byLine.entries())
        .sort(([a], [b]) => a - b)
        .map(([, item]) => item);

    return { ...base, items: merged };
}

export function getLastLineNumber(data: ExtractedPdfData): number {
    if (data.items.length === 0) return 0;
    const last = data.items[data.items.length - 1];
    return last.lineNumber ?? data.items.length;
}

export function formatValidationIssuesForPrompt(issues: ItemValidationIssue[]): string {
    return issues
        .slice(0, 15)
        .map((i) => `- Item index ${i.index + 1} (${i.field}): ${i.message}`)
        .join('\n');
}
