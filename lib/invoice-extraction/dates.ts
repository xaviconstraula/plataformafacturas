/** Validate and fix YYYY-DD-MM vs YYYY-MM-DD from AI extraction. */
export function validateAndFixDate(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string') {
        return dateStr;
    }

    const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = dateStr.match(datePattern);

    if (!match) {
        return dateStr;
    }

    const [, year, middle, end] = match;
    const middleNum = parseInt(middle, 10);
    const endNum = parseInt(end, 10);

    const asIntended = new Date(`${year}-${middle}-${end}`);
    if (!isNaN(asIntended.getTime()) && middleNum >= 1 && middleNum <= 12) {
        return dateStr;
    }

    if (endNum >= 1 && endNum <= 12 && middleNum >= 1 && middleNum <= 31) {
        const swapped = `${year}-${end}-${middle}`;
        const asSwapped = new Date(swapped);
        if (!isNaN(asSwapped.getTime())) {
            return swapped;
        }
    }

    return dateStr;
}
