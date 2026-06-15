import type { ExtractedPdfData, ExtractedPdfItemData } from '@/lib/types/pdf';
import { normalizeComparableText } from '@/lib/invoice-extraction/normalize-extraction';
import { normalizeCifForComparison, normalizeMaterialCode } from '@/lib/utils';

const AMOUNT_TOLERANCE = 0.01;
const QUANTITY_TOLERANCE = 0.001;

export interface FieldDiff {
    field: string;
    stored: string;
    rescanned: string;
}

export interface LineDiff {
    lineNumber: number | null;
    index: number;
    fields: FieldDiff[];
}

export type InvoiceComparisonStatus = 'match' | 'diff' | 'not_found' | 'extraction_error';

export interface InvoiceComparisonResult {
    fileName: string;
    r2Key: string;
    invoiceId?: string;
    invoiceCode: string;
    status: InvoiceComparisonStatus;
    invoiceLevelDiffs?: FieldDiff[];
    lineDiffs?: LineDiff[];
    error?: string;
}

export interface BatchReanalysisReport {
    matchedCount: number;
    diffCount: number;
    notFoundCount: number;
    errorCount: number;
    invoices: InvoiceComparisonResult[];
}

export interface StoredInvoiceForComparison {
    id: string;
    invoiceCode: string;
    issueDate: Date;
    totalAmount: number;
    ivaPercentage: number;
    retentionAmount: number;
    provider: {
        name: string;
        cif: string;
    };
    items: StoredInvoiceItemForComparison[];
}

export interface StoredInvoiceItemForComparison {
    id: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    workOrder: string | null;
    discountPercentage: number | null;
    lineNumber: number | null;
    material: {
        name: string;
        code: string;
    };
}

function formatDate(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
}

function formatNumber(value: number | null | undefined, decimals = 3): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    return value.toFixed(decimals);
}

function formatOptionalString(value: string | null | undefined): string {
    return (value ?? '').trim();
}

function numbersClose(a: number, b: number, tolerance: number): boolean {
    return Math.abs(a - b) <= tolerance;
}

function compareScalarField(
    field: string,
    stored: string,
    rescanned: string,
    diffs: FieldDiff[],
): void {
    if (stored !== rescanned) {
        diffs.push({ field, stored, rescanned });
    }
}

function compareNormalizedTextField(
    field: string,
    stored: string,
    rescanned: string,
    diffs: FieldDiff[],
): void {
    const normalizedStored = normalizeComparableText(stored);
    const normalizedRescanned = normalizeComparableText(rescanned);
    if (normalizedStored !== normalizedRescanned) {
        diffs.push({ field, stored: normalizedStored, rescanned: normalizedRescanned });
    }
}

function compareCifField(
    field: string,
    stored: string,
    rescanned: string,
    diffs: FieldDiff[],
): void {
    const normalizedStored = normalizeCifForComparison(stored) ?? normalizeComparableText(stored);
    const normalizedRescanned = normalizeCifForComparison(rescanned) ?? normalizeComparableText(rescanned);
    if (normalizedStored !== normalizedRescanned) {
        diffs.push({ field, stored, rescanned });
    }
}

function compareMaterialCodeField(
    field: string,
    stored: string,
    rescanned: string,
    diffs: FieldDiff[],
): void {
    const normalizedStored = stored ? normalizeMaterialCode(stored) : '';
    const normalizedRescanned = rescanned ? normalizeMaterialCode(rescanned) : '';
    if (normalizedStored !== normalizedRescanned) {
        diffs.push({ field, stored, rescanned });
    }
}

function compareNumericField(
    field: string,
    stored: number,
    rescanned: number,
    tolerance: number,
    decimals: number,
    diffs: FieldDiff[],
): void {
    if (!numbersClose(stored, rescanned, tolerance)) {
        diffs.push({
            field,
            stored: formatNumber(stored, decimals),
            rescanned: formatNumber(rescanned, decimals),
        });
    }
}

function getStoredLineName(item: StoredInvoiceItemForComparison): string {
    return normalizeComparableText(item.description?.trim() || item.material.name.trim());
}

function getRescannedLineName(item: ExtractedPdfItemData): string {
    return normalizeComparableText(item.materialName.trim());
}

function getRescannedLineCode(item: ExtractedPdfItemData): string {
    return (item.materialCode ?? '').trim();
}

function compareLineFields(
    stored: StoredInvoiceItemForComparison,
    rescanned: ExtractedPdfItemData,
): FieldDiff[] {
    const diffs: FieldDiff[] = [];

    compareNormalizedTextField(
        'materialName',
        getStoredLineName(stored),
        getRescannedLineName(rescanned),
        diffs,
    );
    compareMaterialCodeField(
        'materialCode',
        stored.material.code.trim(),
        getRescannedLineCode(rescanned),
        diffs,
    );
    compareNumericField('quantity', stored.quantity, rescanned.quantity, QUANTITY_TOLERANCE, 3, diffs);
    compareNumericField('unitPrice', stored.unitPrice, rescanned.unitPrice, AMOUNT_TOLERANCE, 3, diffs);
    compareNumericField('totalPrice', stored.totalPrice, rescanned.totalPrice, AMOUNT_TOLERANCE, 3, diffs);
    compareNormalizedTextField(
        'workOrder',
        formatOptionalString(stored.workOrder),
        formatOptionalString(rescanned.workOrder),
        diffs,
    );

    const storedDiscount = stored.discountPercentage ?? 0;
    const rescannedDiscount = rescanned.discountPercentage ?? 0;
    compareNumericField('discountPercentage', storedDiscount, rescannedDiscount, AMOUNT_TOLERANCE, 2, diffs);

    return diffs;
}

function buildLineKey(lineNumber: number | null | undefined, index: number): string {
    return lineNumber !== null && lineNumber !== undefined ? `line:${lineNumber}` : `index:${index}`;
}

export function compareStoredVsExtracted(
    stored: StoredInvoiceForComparison,
    extracted: ExtractedPdfData,
): Pick<InvoiceComparisonResult, 'status' | 'invoiceLevelDiffs' | 'lineDiffs'> {
    const invoiceLevelDiffs: FieldDiff[] = [];

    compareScalarField('invoiceCode', stored.invoiceCode.trim(), extracted.invoiceCode.trim(), invoiceLevelDiffs);
    compareScalarField('issueDate', formatDate(stored.issueDate), formatDate(extracted.issueDate), invoiceLevelDiffs);
    compareNumericField('totalAmount', stored.totalAmount, extracted.totalAmount, AMOUNT_TOLERANCE, 2, invoiceLevelDiffs);
    compareNumericField('ivaPercentage', stored.ivaPercentage, extracted.ivaPercentage, AMOUNT_TOLERANCE, 2, invoiceLevelDiffs);
    compareNumericField('retentionAmount', stored.retentionAmount, extracted.retentionAmount, AMOUNT_TOLERANCE, 2, invoiceLevelDiffs);
    compareCifField('provider.cif', stored.provider.cif.trim(), extracted.provider.cif.trim(), invoiceLevelDiffs);
    compareNormalizedTextField('provider.name', stored.provider.name.trim(), extracted.provider.name.trim(), invoiceLevelDiffs);

    const lineDiffs: LineDiff[] = [];

    if (stored.items.length !== extracted.items.length) {
        invoiceLevelDiffs.push({
            field: 'lineCount',
            stored: String(stored.items.length),
            rescanned: String(extracted.items.length),
        });
    }

    const storedByKey = new Map<string, { item: StoredInvoiceItemForComparison; index: number }>();
    stored.items.forEach((item, index) => {
        storedByKey.set(buildLineKey(item.lineNumber, index), { item, index });
    });

    const rescannedByKey = new Map<string, { item: ExtractedPdfItemData; index: number }>();
    extracted.items.forEach((item, index) => {
        rescannedByKey.set(buildLineKey(item.lineNumber, index), { item, index });
    });

    const allKeys = new Set([...storedByKey.keys(), ...rescannedByKey.keys()]);

    for (const key of allKeys) {
        const storedEntry = storedByKey.get(key);
        const rescannedEntry = rescannedByKey.get(key);

        if (storedEntry && !rescannedEntry) {
            lineDiffs.push({
                lineNumber: storedEntry.item.lineNumber,
                index: storedEntry.index,
                fields: [{
                    field: '_missing',
                    stored: getStoredLineName(storedEntry.item),
                    rescanned: '(no presente en reescaneo)',
                }],
            });
            continue;
        }

        if (!storedEntry && rescannedEntry) {
            lineDiffs.push({
                lineNumber: rescannedEntry.item.lineNumber ?? null,
                index: rescannedEntry.index,
                fields: [{
                    field: '_extra',
                    stored: '(no presente en guardado)',
                    rescanned: getRescannedLineName(rescannedEntry.item),
                }],
            });
            continue;
        }

        if (!storedEntry || !rescannedEntry) continue;

        const fields = compareLineFields(storedEntry.item, rescannedEntry.item);
        if (fields.length > 0) {
            lineDiffs.push({
                lineNumber: storedEntry.item.lineNumber ?? rescannedEntry.item.lineNumber ?? null,
                index: storedEntry.index,
                fields,
            });
        }
    }

    const hasDiffs = invoiceLevelDiffs.length > 0 || lineDiffs.length > 0;

    return {
        status: hasDiffs ? 'diff' : 'match',
        invoiceLevelDiffs: invoiceLevelDiffs.length > 0 ? invoiceLevelDiffs : undefined,
        lineDiffs: lineDiffs.length > 0 ? lineDiffs : undefined,
    };
}

export function summarizeBatchReanalysisReport(invoices: InvoiceComparisonResult[]): BatchReanalysisReport {
    return {
        matchedCount: invoices.filter((item) => item.status === 'match').length,
        diffCount: invoices.filter((item) => item.status === 'diff').length,
        notFoundCount: invoices.filter((item) => item.status === 'not_found').length,
        errorCount: invoices.filter((item) => item.status === 'extraction_error').length,
        invoices,
    };
}
