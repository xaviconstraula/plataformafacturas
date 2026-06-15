import type { ExtractedPdfData, ExtractedPdfItemData } from '@/lib/types/pdf';
import { normalizeCifForComparison, normalizeMaterialCode } from '@/lib/utils';

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeOptionalText(value: string | undefined | null): string | undefined {
    if (value === null || value === undefined) return undefined;
    const normalized = collapseWhitespace(String(value));
    if (!normalized || normalized.toLowerCase() === 'null') return undefined;
    return normalized;
}

export function canonicalizeProviderCif(raw: string): string {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) return trimmed;

    const core = normalizeCifForComparison(trimmed);
    if (!core) return collapseWhitespace(trimmed);

    if (/^ES[A-Z0-9]+$/.test(trimmed.replace(/[\s\-_.:]/g, ''))) {
        return `ES${core}`;
    }

    return `ES${core}`;
}

function normalizeItem(item: ExtractedPdfItemData): ExtractedPdfItemData {
    const materialCode = item.materialCode
        ? normalizeMaterialCode(item.materialCode)
        : undefined;

    return {
        ...item,
        materialName: collapseWhitespace(item.materialName ?? ''),
        materialCode: materialCode || undefined,
        description: normalizeOptionalText(item.description),
        workOrder: normalizeOptionalText(item.workOrder),
        itemDate: normalizeOptionalText(item.itemDate),
        quantity: Number(item.quantity.toFixed(3)),
        unitPrice: Number(item.unitPrice.toFixed(3)),
        totalPrice: Number(item.totalPrice.toFixed(3)),
        listPrice: item.listPrice !== undefined ? Number(item.listPrice.toFixed(3)) : undefined,
        discountRaw: item.discountRaw?.trim() || '0',
        discountPercentage: item.discountPercentage ?? 0,
    };
}

export function normalizeExtractedInvoice(data: ExtractedPdfData): ExtractedPdfData {
    return {
        ...data,
        invoiceCode: collapseWhitespace(data.invoiceCode),
        issueDate: data.issueDate.trim(),
        totalAmount: Number(data.totalAmount.toFixed(2)),
        ivaPercentage: Number((data.ivaPercentage ?? 21).toFixed(2)),
        retentionAmount: Number((data.retentionAmount ?? 0).toFixed(2)),
        provider: {
            ...data.provider,
            name: collapseWhitespace(data.provider.name),
            cif: canonicalizeProviderCif(data.provider.cif),
            email: normalizeOptionalText(data.provider.email),
            phone: normalizeOptionalText(data.provider.phone),
            address: normalizeOptionalText(data.provider.address),
        },
        items: data.items.map(normalizeItem),
    };
}

export function normalizeComparableText(value: string | null | undefined): string {
    return collapseWhitespace(value ?? '');
}
