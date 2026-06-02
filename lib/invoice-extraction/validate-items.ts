import type { ExtractedPdfItemData } from '@/lib/types/pdf';

const PRICE_LIKE = /^\s*-?\d+([.,]\d+)?\s*-?\s*$/;
const MOSTLY_NUMERIC_NAME = /^\s*[\d\s.,\-+]+\s*$/;

export function looksLikePrice(value: string): boolean {
    return PRICE_LIKE.test(value.trim());
}

export function looksLikeBareCode(value: string): boolean {
    const t = value.trim();
    if (t.length === 0 || t.length > 32) return false;
    if (/\s/.test(t)) return false;
    return /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(t);
}

export interface ItemValidationIssue {
    index: number;
    field: 'materialName' | 'materialCode';
    message: string;
}

export function validateExtractedItems(items: ExtractedPdfItemData[]): ItemValidationIssue[] {
    const issues: ItemValidationIssue[] = [];

    items.forEach((item, index) => {
        const name = (item.materialName ?? '').trim();

        if (!name) {
            issues.push({ index, field: 'materialName', message: 'materialName is empty' });
            return;
        }

        if (looksLikePrice(name)) {
            issues.push({ index, field: 'materialName', message: 'materialName looks like a price' });
        }

        if (MOSTLY_NUMERIC_NAME.test(name)) {
            issues.push({ index, field: 'materialName', message: 'materialName is mostly numeric' });
        }

        const code = item.materialCode?.trim();
        if (!code && looksLikeBareCode(name) && name.length <= 20) {
            issues.push({
                index,
                field: 'materialName',
                message: 'materialName looks like a product code without a concept name',
            });
        }
    });

    return issues;
}

export function applyConservativeNameCodeSwap(item: ExtractedPdfItemData): ExtractedPdfItemData {
    const name = (item.materialName ?? '').trim();
    const code = item.materialCode?.trim();

    if (code || !looksLikeBareCode(name) || name.length > 20) {
        return item;
    }

    if (item.description && item.description.trim().length > 3 && !looksLikeBareCode(item.description)) {
        return {
            ...item,
            materialCode: name,
            materialName: item.description.trim(),
        };
    }

    return item;
}
