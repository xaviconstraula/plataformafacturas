import { SEMANTIC_EXTRACTION_SPEC, JSON_OUTPUT_EXAMPLE } from '@/lib/invoice-extraction/semantic-spec';

export interface JsonPromptOptions {
    fromLineNumber?: number;
    itemsOnly?: boolean;
}

const CONSISTENCY_INSTRUCTION = `
Be consistent: extract the same semantic fields with the same formats on every invoice.
Return only valid JSON matching the schema. No explanations or markdown.
`;

function baseSpecSection(): string {
    return `${SEMANTIC_EXTRACTION_SPEC}
${JSON_OUTPUT_EXAMPLE}
${CONSISTENCY_INSTRUCTION}`;
}

export function buildJsonExtractionPrompt(options?: JsonPromptOptions): string {
    const fromLine = options?.fromLineNumber;
    const startHint = fromLine
        ? `\nExtract ONLY line items with lineNumber >= ${fromLine}. Omit invoice header and provider.`
        : '';

    return `Extract all invoice data from this PDF into the required JSON schema. Consolidate all pages into one invoice. Only extract visible data.${startHint}

${baseSpecSection()}

Skip non-line rows. Include every product/service line in exact visual order.`;
}

export function buildJsonItemsFollowUpPrompt(fromLineNumber: number): string {
    return `Continue extracting invoice LINE ITEMS only from this PDF into JSON.
Return ONLY an object with an "items" array.
Include lines with lineNumber >= ${fromLineNumber} in exact visual order.
Do not repeat items already extracted before line ${fromLineNumber}.

${baseSpecSection()}`;
}

export function buildJsonCorrectionPrompt(validationSummary: string): string {
    return `Your previous JSON extraction had errors. Re-extract the full invoice fixing ONLY these issues:
${validationSummary}

${baseSpecSection()}

Return complete valid JSON matching the schema.`;
}
