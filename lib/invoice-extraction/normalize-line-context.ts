function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: string | null | undefined): string {
    return collapseWhitespace(value ?? '');
}

export function stripLineNoteBoilerplate(text: string): string {
    let normalized = text;

    normalized = normalized.replace(/ALBARAN\s*N[ºO°.]?\s*[\d.]+\s*/gi, '');
    normalized = normalized.replace(/\bFECHA\s+[\d.\-/]+\s*/gi, '');
    normalized = normalized.replace(/S\/REF\s*:\s*/gi, 'S/REF:');
    normalized = normalized.replace(/OBRA\s*:\s*/gi, 'OBRA:');
    normalized = normalized.replace(/\(OT\.\s*(\d+)\s*\)/gi, '(OT.$1)');

    return collapseWhitespace(normalized);
}

export function normalizeLineNoteForComparison(text: string | null | undefined): string {
    if (!text?.trim()) return '';
    return stripLineNoteBoilerplate(normalizeComparableText(text)).toUpperCase();
}

export function canonicalizeLineNote(text: string | null | undefined): string | undefined {
    if (!text?.trim()) return undefined;
    const normalized = stripLineNoteBoilerplate(normalizeComparableText(text));
    return normalized || undefined;
}

export function extractPrimaryOtNumber(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;

    const upper = raw.toUpperCase();

    const obraOt = upper.match(/OBRA:[^(]*\(OT\.?\s*(\d+)\s*\)/i);
    if (obraOt?.[1]) return obraOt[1];

    const srefOt = upper.match(/S\/REF[^-]*-\s*OT\s*(\d+)/i);
    if (srefOt?.[1]) return srefOt[1];

    const otMatches = [...upper.matchAll(/(?:^|[^0-9])OT[.\s\-_:]*(\d+)/gi)];
    for (const match of otMatches) {
        if (match[1].length <= 6) {
            return match[1];
        }
    }

    if (otMatches.length > 0) {
        return otMatches[otMatches.length - 1][1];
    }

    const stripped = upper.replace(/^(OT|CECO)[\s\-_.:/]*/i, '');
    const digits = stripped.replace(/\D/g, '');
    if (digits.length > 0 && digits.length <= 6) {
        return digits;
    }

    return null;
}

export function combineWorkOrderContext(
    workOrder: string | null | undefined,
    note: string | null | undefined,
): string {
    return [workOrder, note]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' ');
}

export function workOrdersEquivalent(
    left: string | null | undefined,
    right: string | null | undefined,
): boolean {
    const leftValue = (left ?? '').trim();
    const rightValue = (right ?? '').trim();

    if (!leftValue && !rightValue) return true;
    if (!leftValue || !rightValue) return false;

    const leftOt = extractPrimaryOtNumber(leftValue);
    const rightOt = extractPrimaryOtNumber(rightValue);
    if (leftOt && rightOt && leftOt === rightOt) {
        return true;
    }

    const leftDigits = leftValue.replace(/\D/g, '');
    const rightDigits = rightValue.replace(/\D/g, '');

    if (leftDigits && rightDigits) {
        if (leftDigits === rightDigits) return true;

        const shorter = leftDigits.length < rightDigits.length ? leftDigits : rightDigits;
        const longer = leftDigits.length >= rightDigits.length ? leftDigits : rightDigits;

        if (shorter.length >= 4 && (longer.startsWith(shorter) || longer.includes(shorter))) {
            return true;
        }

        if (leftOt && rightDigits.includes(leftOt)) return true;
        if (rightOt && leftDigits.includes(rightOt)) return true;
    }

    return normalizeComparableText(leftValue).toUpperCase() === normalizeComparableText(rightValue).toUpperCase();
}

export function canonicalizeWorkOrder(raw: string | null | undefined): string | undefined {
    if (!raw?.trim()) return undefined;

    const primaryOt = extractPrimaryOtNumber(raw);
    if (primaryOt) return primaryOt;

    const digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && digits.length <= 6) {
        return digits;
    }

    return collapseWhitespace(raw);
}

export function formatWorkOrderDisplay(raw: string | null | undefined): string {
    if (!raw?.trim()) return '—';

    const primaryOt = extractPrimaryOtNumber(raw);
    if (primaryOt) return `OT-${primaryOt}`;

    const digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && digits.length <= 6) {
        return `OT-${digits}`;
    }

    return collapseWhitespace(raw).toUpperCase();
}
