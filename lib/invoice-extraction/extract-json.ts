import type { GoogleGenAI } from '@google/genai';
import type { ExtractedPdfData } from '@/lib/types/pdf';
import {
    EXTRACTED_INVOICE_JSON_SCHEMA,
    EXTRACTED_ITEMS_JSON_SCHEMA,
} from '@/lib/invoice-extraction/schema';
import {
    buildJsonCorrectionPrompt,
    buildJsonExtractionPrompt,
    buildJsonItemsFollowUpPrompt,
} from '@/lib/invoice-extraction/prompt';
import {
    formatValidationIssuesForPrompt,
    getLastLineNumber,
    mergeExtractedItems,
    parseGeminiItemsOnlyJson,
    parseGeminiJsonExtraction,
} from '@/lib/invoice-extraction/parse-json';
import { MIN_ITEMS_BEFORE_FOLLOW_UP } from '@/lib/invoice-extraction/config';

const GEMINI_JSON_CONFIG = {
    candidateCount: 1,
    thinkingConfig: { thinkingBudget: 0 },
} as const;

function getResponseText(result: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
}): { text: string; finishReason?: string } {
    const text =
        result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const finishReason = result.candidates?.[0]?.finishReason as string | undefined;
    return { text, finishReason };
}

async function callGeminiJson(
    gemini: GoogleGenAI,
    model: string,
    promptText: string,
    base64: string,
    schema: typeof EXTRACTED_INVOICE_JSON_SCHEMA | typeof EXTRACTED_ITEMS_JSON_SCHEMA,
): Promise<{ text: string; finishReason?: string }> {
    const result = await gemini.models.generateContent({
        model,
        contents: [
            {
                role: 'user',
                parts: [
                    { text: promptText },
                    { inlineData: { mimeType: 'application/pdf', data: base64 } },
                ],
            },
        ],
        config: {
            ...GEMINI_JSON_CONFIG,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
        },
    });

    return getResponseText(result);
}

async function fetchAdditionalItems(
    gemini: GoogleGenAI,
    model: string,
    base64: string,
    fileName: string,
    fromLineNumber: number,
): Promise<ExtractedPdfData['items']> {
    const prompt = buildJsonItemsFollowUpPrompt(fromLineNumber);
    const { text, finishReason } = await callGeminiJson(
        gemini,
        model,
        prompt,
        base64,
        EXTRACTED_ITEMS_JSON_SCHEMA,
    );

    if (!text) {
        console.warn(`[${fileName}] Items follow-up returned no text (from line ${fromLineNumber})`);
        return [];
    }

    const items = parseGeminiItemsOnlyJson(text);
    if (!items || items.length === 0) {
        console.warn(`[${fileName}] Items follow-up parse failed (finish=${finishReason})`);
        return [];
    }

    console.log(`[${fileName}] Items follow-up added ${items.length} lines from #${fromLineNumber}`);
    return items;
}

export interface JsonExtractionResult {
    extractedData: ExtractedPdfData | null;
    error?: string;
}

export async function extractInvoiceJsonFromPdf(params: {
    gemini: GoogleGenAI;
    model: string;
    fileName: string;
    base64: string;
    allowRetryOnValidation?: boolean;
}): Promise<JsonExtractionResult> {
    const { gemini, model, fileName, base64, allowRetryOnValidation = true } = params;

    let promptText = buildJsonExtractionPrompt();
    let parseResult = await (async () => {
        const { text, finishReason } = await callGeminiJson(
            gemini,
            model,
            promptText,
            base64,
            EXTRACTED_INVOICE_JSON_SCHEMA,
        );

        if (!text) {
            return { data: null as ExtractedPdfData | null, error: 'No content from Gemini.', finishReason };
        }

        let parsed = parseGeminiJsonExtraction(text);
        let data = parsed.data;

        if (finishReason === 'MAX_TOKENS' && data && data.items.length >= MIN_ITEMS_BEFORE_FOLLOW_UP) {
            let nextLine = getLastLineNumber(data) + 1;
            let guard = 0;
            while (guard < 20) {
                guard += 1;
                const more = await fetchAdditionalItems(gemini, model, base64, fileName, nextLine);
                if (more.length === 0) break;
                data = mergeExtractedItems(data, more);
                nextLine = getLastLineNumber(data) + 1;
            }
            parsed = { data };
        }

        if (!data && finishReason === 'MAX_TOKENS') {
            return {
                data: null,
                error: 'AI response truncated (MAX_TOKENS). Invoice may have too many lines.',
                finishReason,
            };
        }

        if (!data) {
            const msg =
                parsed.validationIssues?.length
                    ? `Validation failed: ${formatValidationIssuesForPrompt(parsed.validationIssues)}`
                    : parsed.zodError ?? 'Invalid JSON extraction';
            return { data: null, error: msg, finishReason };
        }

        return { data, finishReason };
    })();

    if (
        !parseResult.data &&
        allowRetryOnValidation &&
        parseResult.error?.includes('Validation failed')
    ) {
        promptText = buildJsonCorrectionPrompt(parseResult.error);
        const { text } = await callGeminiJson(
            gemini,
            model,
            promptText,
            base64,
            EXTRACTED_INVOICE_JSON_SCHEMA,
        );
        if (text) {
            const retry = parseGeminiJsonExtraction(text);
            if (retry.data) {
                parseResult = { data: retry.data, finishReason: undefined };
            }
        }
    }

    if (!parseResult.data) {
        return { extractedData: null, error: parseResult.error ?? 'JSON extraction failed' };
    }

    return { extractedData: parseResult.data };
}
