import path from 'path';
import { parseJsonLinesFromFile } from '@/lib/utils/jsonl-parser';
import { parseJsonSafe, isExtractedPdfData } from '@/lib/actions/invoices';

function getGeminiText(response: any): string | null {
    if (!response || typeof response !== 'object') return null;
    const candidates = (response as any).candidates as Array<any> | undefined;
    if (Array.isArray(candidates) && candidates.length > 0) {
        const content = candidates[0]?.content;
        const parts = content?.parts as Array<any> | undefined;
        if (Array.isArray(parts) && parts.length > 0 && typeof parts[0]?.text === 'string') {
            return parts[0].text as string;
        }
    }
    // Some responses might be { response: { text: string } }
    const text = (response as any).text;
    if (typeof text === 'string') return text;
    return null;
}

async function main() {
    const filePath = path.resolve(process.cwd(), 'tmp', 'facturas-batch', 'batch-wdkmjz2f5g4swahgscnxalp43hhzf69mn9nt');
    console.log(`[parse-batch-test] Reading: ${filePath}`);
    const results = (await parseJsonLinesFromFile(filePath)) as Array<any>;
    console.log(`[parse-batch-test] Lines read: ${results.length}`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < results.length; i++) {
        const lineIndex = i + 1;
        const row = results[i];
        const key = row?.key ?? `line-${lineIndex}`;
        const response = row?.response ?? row?.Response ?? null;

        if (!response) {
            console.warn(`[parse-batch-test] No response object for ${key} (line ${lineIndex})`);
            failed++;
            continue;
        }

        const text = getGeminiText(response);
        if (!text) {
            console.error(`[parse-batch-test] Missing text content for ${key} (line ${lineIndex})`);
            failed++;
            continue;
        }

        const parsed = parseJsonSafe(text);
        if (!parsed || !isExtractedPdfData(parsed)) {
            console.error(`[parse-batch-test] Failed to parse extracted data JSON for ${key} (line ${lineIndex})`);
            const preview = text.substring(0, 300);
            console.error(`[parse-batch-test] Raw content preview: ${preview}${text.length > 300 ? '...' : ''}`);
            failed++;
            continue;
        }
        success++;
    }

    console.log(`[parse-batch-test] Summary: ${success} parsed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('[parse-batch-test] Error:', err);
    process.exit(1);
});


