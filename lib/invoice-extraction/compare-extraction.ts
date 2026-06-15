import type { ExtractedPdfData, ExtractedPdfItemData } from '@/lib/types/pdf';
import { normalizeComparableText } from '@/lib/invoice-extraction/normalize-extraction';
import {
    canonicalizeLineNote,
    canonicalizeWorkOrder,
    combineWorkOrderContext,
    formatWorkOrderDisplay,
    normalizeLineNoteForComparison,
    workOrdersEquivalent,
} from '@/lib/invoice-extraction/normalize-line-context';
import { areMaterialNamesSimilar, normalizeCifForComparison, normalizeMaterialCode, normalizeMaterialName } from '@/lib/utils';

const AMOUNT_TOLERANCE = 0.01;
const QUANTITY_TOLERANCE = 0.001;

export const MINOR_DIFF_FIELDS = new Set(['lineNote', 'workOrder', 'lineNumber']);

export type FieldDiffSeverity = 'major' | 'minor';

export interface FieldDiff {
    field: string;
    stored: string;
    rescanned: string;
    severity?: FieldDiffSeverity;
}

export function isMinorDiffField(field: string): boolean {
    return MINOR_DIFF_FIELDS.has(field);
}

function pushFieldDiff(diffs: FieldDiff[], diff: FieldDiff): void {
    diffs.push({
        ...diff,
        severity: diff.severity ?? (isMinorDiffField(diff.field) ? 'minor' : 'major'),
    });
}

export type LineMatchKind = 'lineNumber' | 'content' | 'missing' | 'extra';

export interface LineDiff {
    lineNumber: number | null;
    index: number;
    rescannedLineNumber?: number | null;
    rescannedIndex?: number;
    canonicalLineName?: string;
    storedLineLabel?: string;
    rescannedLineLabel?: string;
    matchKind?: LineMatchKind;
    fields: FieldDiff[];
}

export type InvoiceComparisonStatus = 'match' | 'diff' | 'minor_diff' | 'not_found' | 'extraction_error';

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
    minorDiffCount: number;
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

interface IndexedStoredItem {
    item: StoredInvoiceItemForComparison;
    index: number;
}

interface IndexedRescannedItem {
    item: ExtractedPdfItemData;
    index: number;
}

interface LinePair {
    stored: IndexedStoredItem;
    rescanned: IndexedRescannedItem;
    matchKind: 'lineNumber' | 'content';
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

export function normalizeWorkOrderForComparison(raw: string | null | undefined): string {
    return canonicalizeWorkOrder(raw) ?? '';
}

export { formatWorkOrderDisplay } from '@/lib/invoice-extraction/normalize-line-context';

function compareScalarField(
    field: string,
    stored: string,
    rescanned: string,
    diffs: FieldDiff[],
): void {
    if (stored !== rescanned) {
        pushFieldDiff(diffs, { field, stored, rescanned });
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
        pushFieldDiff(diffs, { field, stored: normalizedStored, rescanned: normalizedRescanned });
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
        pushFieldDiff(diffs, { field, stored, rescanned });
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
        pushFieldDiff(diffs, { field, stored, rescanned });
    }
}

function compareLineNoteField(
    stored: string | null | undefined,
    rescanned: string | null | undefined,
    diffs: FieldDiff[],
): void {
    const normalizedStored = normalizeLineNoteForComparison(stored);
    const normalizedRescanned = normalizeLineNoteForComparison(rescanned);

    if (normalizedStored !== normalizedRescanned) {
        pushFieldDiff(diffs, {
            field: 'lineNote',
            stored: normalizedStored || '—',
            rescanned: normalizedRescanned || '—',
            severity: 'minor',
        });
    }
}

function compareWorkOrderField(
    storedWorkOrder: string | null | undefined,
    rescannedWorkOrder: string | null | undefined,
    storedNote: string | null | undefined,
    rescannedNote: string | null | undefined,
    diffs: FieldDiff[],
): void {
    const storedContext = combineWorkOrderContext(storedWorkOrder, storedNote);
    const rescannedContext = combineWorkOrderContext(rescannedWorkOrder, rescannedNote);

    if (!workOrdersEquivalent(storedContext, rescannedContext)) {
        pushFieldDiff(diffs, {
            field: 'workOrder',
            stored: formatWorkOrderDisplay(storedContext),
            rescanned: formatWorkOrderDisplay(rescannedContext),
            severity: 'minor',
        });
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
        pushFieldDiff(diffs, {
            field,
            stored: formatNumber(stored, decimals),
            rescanned: formatNumber(rescanned, decimals),
        });
    }
}

function getStoredCanonicalProductName(item: StoredInvoiceItemForComparison): string {
    return normalizeComparableText(item.material.name.trim());
}

function getStoredLineNote(item: StoredInvoiceItemForComparison): string | null {
    const description = item.description?.trim();
    if (!description) return null;

    const materialName = item.material.name.trim();
    if (!materialName) return normalizeComparableText(description);

    if (normalizeMaterialName(description) === normalizeMaterialName(materialName)) {
        return null;
    }

    return normalizeComparableText(description);
}

function getRescannedLineName(item: ExtractedPdfItemData): string {
    return normalizeComparableText(item.materialName.trim());
}

function getRescannedLineCode(item: ExtractedPdfItemData): string {
    return (item.materialCode ?? '').trim();
}

function buildStoredLineLabel(item: StoredInvoiceItemForComparison): string {
    const parts = [getStoredCanonicalProductName(item)];
    const note = getStoredLineNote(item);
    if (note) {
        parts.push(`nota: ${note}`);
    }
    return parts.filter(Boolean).join(' · ');
}

function buildRescannedLineLabel(item: ExtractedPdfItemData): string {
    const parts = [getRescannedLineName(item)];
    const description = item.description?.trim();
    if (description && normalizeMaterialName(description) !== normalizeMaterialName(item.materialName)) {
        parts.push(`detalle: ${normalizeComparableText(description)}`);
    }
    return parts.filter(Boolean).join(' · ');
}

function buildCanonicalLineName(
    stored: StoredInvoiceItemForComparison | null,
    rescanned: ExtractedPdfItemData | null,
): string {
    const candidates = [
        stored ? getStoredCanonicalProductName(stored) : '',
        rescanned ? getRescannedLineName(rescanned) : '',
    ].filter(Boolean);

    if (candidates.length === 0) return 'Línea sin nombre';
    if (candidates.length === 1) return candidates[0];

    const [first, second] = candidates;
    if (normalizeMaterialName(first) === normalizeMaterialName(second) || areMaterialNamesSimilar(first, second)) {
        return first;
    }

    return `Guardado: ${first} / Rescaneado: ${second}`;
}

function linesMatchByContent(
    stored: StoredInvoiceItemForComparison,
    rescanned: ExtractedPdfItemData,
): boolean {
    const storedCode = normalizeMaterialCode(stored.material.code.trim());
    const rescannedCode = normalizeMaterialCode(getRescannedLineCode(rescanned));
    const codeMatch = storedCode.length > 0 && rescannedCode.length > 0 && storedCode === rescannedCode;

    const storedName = getStoredCanonicalProductName(stored);
    const rescannedName = getRescannedLineName(rescanned);
    const nameMatch = normalizeMaterialName(storedName) === normalizeMaterialName(rescannedName)
        || areMaterialNamesSimilar(storedName, rescannedName);

    const priceMatch = numbersClose(stored.totalPrice, rescanned.totalPrice, AMOUNT_TOLERANCE);
    const quantityMatch = numbersClose(stored.quantity, rescanned.quantity, QUANTITY_TOLERANCE);

    return (nameMatch || codeMatch) && priceMatch && quantityMatch;
}

function pairLinesByNumberAndContent(
    storedItems: IndexedStoredItem[],
    rescannedItems: IndexedRescannedItem[],
): {
    pairs: LinePair[];
    unmatchedStored: IndexedStoredItem[];
    unmatchedRescanned: IndexedRescannedItem[];
} {
    const usedStored = new Set<number>();
    const usedRescanned = new Set<number>();
    const pairs: LinePair[] = [];

    const rescannedByLineNumber = new Map<number, IndexedRescannedItem[]>();
    for (const entry of rescannedItems) {
        const lineNumber = entry.item.lineNumber;
        if (lineNumber === null || lineNumber === undefined) continue;
        const bucket = rescannedByLineNumber.get(lineNumber) ?? [];
        bucket.push(entry);
        rescannedByLineNumber.set(lineNumber, bucket);
    }

    for (const storedEntry of storedItems) {
        const lineNumber = storedEntry.item.lineNumber;
        if (lineNumber === null || lineNumber === undefined) continue;

        const candidates = rescannedByLineNumber.get(lineNumber) ?? [];
        const match = candidates.find((candidate) => !usedRescanned.has(candidate.index));
        if (!match) continue;

        usedStored.add(storedEntry.index);
        usedRescanned.add(match.index);
        pairs.push({ stored: storedEntry, rescanned: match, matchKind: 'lineNumber' });
    }

    const remainingStored = storedItems.filter((entry) => !usedStored.has(entry.index));
    const remainingRescanned = rescannedItems.filter((entry) => !usedRescanned.has(entry.index));

    for (const storedEntry of remainingStored) {
        const contentMatch = remainingRescanned.find(
            (candidate) => !usedRescanned.has(candidate.index) && linesMatchByContent(storedEntry.item, candidate.item),
        );

        if (!contentMatch) continue;

        usedStored.add(storedEntry.index);
        usedRescanned.add(contentMatch.index);
        pairs.push({ stored: storedEntry, rescanned: contentMatch, matchKind: 'content' });
    }

    return {
        pairs,
        unmatchedStored: storedItems.filter((entry) => !usedStored.has(entry.index)),
        unmatchedRescanned: rescannedItems.filter((entry) => !usedRescanned.has(entry.index)),
    };
}

function compareLineFields(
    stored: StoredInvoiceItemForComparison,
    rescanned: ExtractedPdfItemData,
): FieldDiff[] {
    const diffs: FieldDiff[] = [];

    compareNormalizedTextField(
        'materialName',
        getStoredCanonicalProductName(stored),
        getRescannedLineName(rescanned),
        diffs,
    );

    const storedNote = getStoredLineNote(stored);
    const rescannedNote = rescanned.description?.trim()
        ? normalizeComparableText(rescanned.description)
        : null;

    if (storedNote || rescannedNote) {
        compareLineNoteField(storedNote, rescannedNote, diffs);
    }

    compareMaterialCodeField(
        'materialCode',
        stored.material.code.trim(),
        getRescannedLineCode(rescanned),
        diffs,
    );
    compareNumericField('quantity', stored.quantity, rescanned.quantity, QUANTITY_TOLERANCE, 3, diffs);
    compareNumericField('unitPrice', stored.unitPrice, rescanned.unitPrice, AMOUNT_TOLERANCE, 3, diffs);
    compareNumericField('totalPrice', stored.totalPrice, rescanned.totalPrice, AMOUNT_TOLERANCE, 3, diffs);
    compareWorkOrderField(stored.workOrder, rescanned.workOrder, storedNote, rescannedNote, diffs);

    const storedDiscount = stored.discountPercentage ?? 0;
    const rescannedDiscount = rescanned.discountPercentage ?? 0;
    compareNumericField('discountPercentage', storedDiscount, rescannedDiscount, AMOUNT_TOLERANCE, 2, diffs);

    return diffs;
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

    const storedItems = stored.items.map((item, index) => ({ item, index }));
    const rescannedItems = extracted.items.map((item, index) => ({ item, index }));

    const { pairs, unmatchedStored, unmatchedRescanned } = pairLinesByNumberAndContent(storedItems, rescannedItems);

    if (unmatchedStored.length > 0 || unmatchedRescanned.length > 0) {
        invoiceLevelDiffs.push({
            field: 'lineCount',
            stored: String(stored.items.length),
            rescanned: String(extracted.items.length),
        });
    }

    for (const pair of pairs) {
        const fields = compareLineFields(pair.stored.item, pair.rescanned.item);
        const hasRenumbering = pair.matchKind === 'content'
            || pair.stored.item.lineNumber !== pair.rescanned.item.lineNumber;

        if (fields.length === 0 && !hasRenumbering) {
            continue;
        }

        const lineDiff: LineDiff = {
            lineNumber: pair.stored.item.lineNumber ?? pair.stored.index + 1,
            index: pair.stored.index,
            rescannedLineNumber: pair.rescanned.item.lineNumber ?? pair.rescanned.index + 1,
            rescannedIndex: pair.rescanned.index,
            canonicalLineName: buildCanonicalLineName(pair.stored.item, pair.rescanned.item),
            storedLineLabel: buildStoredLineLabel(pair.stored.item),
            rescannedLineLabel: buildRescannedLineLabel(pair.rescanned.item),
            matchKind: pair.matchKind,
            fields,
        };

        if (hasRenumbering && !fields.some((field) => field.field === 'lineNumber')) {
            fields.unshift({
                field: 'lineNumber',
                stored: String(pair.stored.item.lineNumber ?? pair.stored.index + 1),
                rescanned: String(pair.rescanned.item.lineNumber ?? pair.rescanned.index + 1),
                severity: 'minor',
            });
        }

        lineDiffs.push(lineDiff);
    }

    for (const storedEntry of unmatchedStored) {
        lineDiffs.push({
            lineNumber: storedEntry.item.lineNumber,
            index: storedEntry.index,
            canonicalLineName: getStoredCanonicalProductName(storedEntry.item) || 'Línea sin nombre',
            storedLineLabel: buildStoredLineLabel(storedEntry.item),
            matchKind: 'missing',
            fields: [{
                field: '_missing',
                stored: buildStoredLineLabel(storedEntry.item),
                rescanned: '(no presente en reescaneo)',
            }],
        });
    }

    for (const rescannedEntry of unmatchedRescanned) {
        lineDiffs.push({
            lineNumber: rescannedEntry.item.lineNumber ?? null,
            index: rescannedEntry.index,
            rescannedLineNumber: rescannedEntry.item.lineNumber ?? rescannedEntry.index + 1,
            rescannedIndex: rescannedEntry.index,
            canonicalLineName: getRescannedLineName(rescannedEntry.item) || 'Línea sin nombre',
            rescannedLineLabel: buildRescannedLineLabel(rescannedEntry.item),
            matchKind: 'extra',
            fields: [{
                field: '_extra',
                stored: '(no presente en guardado)',
                rescanned: buildRescannedLineLabel(rescannedEntry.item),
            }],
        });
    }

    lineDiffs.sort((a, b) => {
        const lineA = a.lineNumber ?? a.index + 1;
        const lineB = b.lineNumber ?? b.index + 1;
        return lineA - lineB;
    });

    return {
        status: resolveComparisonStatus(invoiceLevelDiffs, lineDiffs),
        invoiceLevelDiffs: invoiceLevelDiffs.length > 0 ? invoiceLevelDiffs : undefined,
        lineDiffs: lineDiffs.length > 0 ? lineDiffs : undefined,
    };
}

function collectComparableFieldDiffs(
    invoiceLevelDiffs: FieldDiff[],
    lineDiffs: LineDiff[],
): FieldDiff[] {
    return [
        ...invoiceLevelDiffs,
        ...lineDiffs.flatMap((line) => line.fields.filter((field) => field.field !== '_missing' && field.field !== '_extra')),
    ];
}

function hasMajorLineIssues(lineDiffs: LineDiff[]): boolean {
    return lineDiffs.some((line) => line.matchKind === 'missing' || line.matchKind === 'extra');
}

export function resolveComparisonStatus(
    invoiceLevelDiffs: FieldDiff[],
    lineDiffs: LineDiff[],
): InvoiceComparisonStatus {
    if (hasMajorLineIssues(lineDiffs)) {
        return 'diff';
    }

    const allFieldDiffs = collectComparableFieldDiffs(invoiceLevelDiffs, lineDiffs);
    if (allFieldDiffs.length === 0) {
        return 'match';
    }

    const hasMajorFieldDiffs = allFieldDiffs.some((field) => (field.severity ?? 'major') === 'major');
    return hasMajorFieldDiffs ? 'diff' : 'minor_diff';
}

export function summarizeBatchReanalysisReport(invoices: InvoiceComparisonResult[]): BatchReanalysisReport {
    return {
        matchedCount: invoices.filter((item) => item.status === 'match').length,
        diffCount: invoices.filter((item) => item.status === 'diff').length,
        minorDiffCount: invoices.filter((item) => item.status === 'minor_diff').length,
        notFoundCount: invoices.filter((item) => item.status === 'not_found').length,
        errorCount: invoices.filter((item) => item.status === 'extraction_error').length,
        invoices,
    };
}
