export interface JsonPromptOptions {
    fromLineNumber?: number;
    itemsOnly?: boolean;
}

function columnMappingSection(): string {
    return `
SPANISH INVOICE COLUMN MAPPING (CRITICAL):
• materialCode ← CÓDIGO / REF / ARTÍCULO column only (short alphanumeric reference).
• materialName ← CONCEPTO / DESCRIPCIÓN column only (human-readable product/service name).
• NEVER put prices (25.50, 18.00) in materialName.
• NEVER put product codes in materialName when CONCEPTO text exists in the same row.
• description ← only extra detail beyond materialName on that row; null if redundant.

ROW INDEPENDENCE:
• Each table row is separate. Blank prices on row 1 → unitPrice 0, totalPrice 0 — do not borrow from row 2.
• PACK/KIT lines often have no prices → quantity as shown, unitPrice 0, totalPrice 0, discountRaw "0".

ORDER: items[] MUST follow exact visual order on the invoice. Set lineNumber sequentially from 1.

DATES: issueDate and itemDate as YYYY-MM-DD (convert DD/MM/YYYY). Never YYYY-DD-MM.

PROVIDER.cif: include country prefix (ESB12345678 for Spanish NIF B12345678). No spaces.

IVA: ivaPercentage required (21.00 default if unclear). retentionAmount required (0.00 if none).

CREDIT NOTES: negative amounts where shown (74,40- → -74.40).`;
}

export function buildJsonExtractionPrompt(options?: JsonPromptOptions): string {
    const fromLine = options?.fromLineNumber;
    const startHint = fromLine
        ? `\nExtract ONLY line items with lineNumber >= ${fromLine}. Omit invoice header and provider.`
        : '';

    return `Extract all invoice data from this PDF into the required JSON schema. Consolidate all pages into one invoice. Only visible data.${startHint}
${columnMappingSection()}

Skip non-line rows (loyalty points, subtotal headers without products). Include every product/service line.`;
}

export function buildJsonItemsFollowUpPrompt(fromLineNumber: number): string {
    return `Continue extracting invoice LINE ITEMS only from this PDF into JSON.
Return ONLY an object with "items" array.
Include lines with lineNumber >= ${fromLineNumber} in exact visual order.
${columnMappingSection()}
Do not repeat items already extracted before line ${fromLineNumber}.`;
}

export function buildJsonCorrectionPrompt(validationSummary: string): string {
    return `Your previous JSON extraction had validation errors. Re-extract the full invoice fixing ONLY these issues:
${validationSummary}
${columnMappingSection()}
Return complete valid JSON matching the schema.`;
}
