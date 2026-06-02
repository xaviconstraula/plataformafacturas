/** Combined discount from raw text (e.g. "50 5" = 50% then 5%). */
export function calculateCombinedDiscount(discountRaw: string): number {
    const trimmed = discountRaw.trim();
    if (!trimmed || trimmed === '~' || trimmed.toLowerCase() === 'neto') {
        return 0;
    }

    const discounts = trimmed.split(/[\s+\-,;]+/).map((d) => parseFloat(d)).filter((d) => !isNaN(d) && d > 0);

    if (discounts.length === 0) {
        return 0;
    }

    if (discounts.length === 1) {
        return Math.min(discounts[0], 100);
    }

    let multiplier = 1;
    for (const discount of discounts) {
        multiplier *= 1 - Math.min(discount, 100) / 100;
    }

    return Number(((1 - multiplier) * 100).toFixed(2));
}
