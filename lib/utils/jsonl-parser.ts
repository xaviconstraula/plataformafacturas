import fs from 'fs';
import readline from 'readline';

// Streaming parser that extracts complete JSON objects via brace matching.
// This is robust to embedded newlines inside strings and arbitrary chunk boundaries.
export async function parseJsonLinesFromFile(filePath: string): Promise<{ objects: unknown[]; hasErrors: boolean; errorCount: number }> {
    // Phase 1: Try strict line-by-line JSONL parsing (fast path)
    const lineResults: unknown[] = [];
    let lineErrors = 0;

    try {
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line || !line.trim()) continue;
            try {
                lineResults.push(JSON.parse(line));
            } catch (err) {
                lineErrors++;
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[jsonl-parser] Line-mode parse error: ${errorMsg}`);
            }
        }
    } catch (e) {
        // If line-mode itself fails (e.g., stream error), we will fall back to brace scan
        console.warn('[jsonl-parser] Line-mode parsing failed, will attempt brace-scan fallback');
    }

    // If we got some objects and no errors, return early
    if (lineResults.length > 0 && lineErrors === 0) {
        console.log(`[jsonl-parser] Successfully parsed ${lineResults.length} JSONL lines (strict mode)`);
        return { objects: lineResults, hasErrors: false, errorCount: 0 };
    }

    // Phase 2: Fallback — brace-scan over the full file to recover valid objects even if lines were split
    const braceResults: unknown[] = [];
    const braceErrors: Array<{ position: number; error: string; raw: string }> = [];

    const text = await fs.promises.readFile(filePath, 'utf8');

    let i = 0;
    let objectStart = -1;
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    while (i < text.length) {
        const char = text[i];

        if (escapeNext) {
            escapeNext = false;
            i++;
            continue;
        }

        if (inString) {
            if (char === '\\') {
                escapeNext = true;
            } else if (char === '"') {
                inString = false;
            }
            i++;
            continue;
        }

        if (char === '"') {
            inString = true;
            i++;
            continue;
        }

        if (char === '{') {
            if (depth === 0) objectStart = i;
            depth++;
        } else if (char === '}') {
            if (depth > 0) depth--;
            if (depth === 0 && objectStart !== -1) {
                const objText = text.slice(objectStart, i + 1);
                try {
                    braceResults.push(JSON.parse(objText));
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    braceErrors.push({ position: objectStart, error: errorMsg, raw: objText.substring(0, 500) + (objText.length > 500 ? '...' : '') });
                    console.error(`[jsonl-parser] Brace-scan parse error at ${objectStart}: ${errorMsg}`);
                }
                objectStart = -1;
            }
        }
        i++;
    }

    // Merge results: prefer brace-scan when strict failed or returned 0
    if (braceResults.length > 0) {
        // Simple dedupe by JSON.stringify signature
        const seen = new Set<string>();
        const merged: unknown[] = [];
        for (const obj of [...lineResults, ...braceResults]) {
            try {
                const key = JSON.stringify(obj);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(obj);
                }
            } catch { /* ignore non-serializable (should not happen) */ }
        }
        const hadErrors = lineErrors > 0 || braceErrors.length > 0;
        if (hadErrors) {
            console.warn(`[jsonl-parser] Parsed ${merged.length} JSON objects with ${lineErrors + braceErrors.length} errors from ${filePath}`);
        } else {
            console.log(`[jsonl-parser] Successfully parsed ${merged.length} JSON objects from ${filePath}`);
        }
        return { objects: merged, hasErrors: hadErrors, errorCount: lineErrors + braceErrors.length };
    }

    // If still nothing, report as error but don't throw
    console.warn(`[jsonl-parser] Could not parse any JSON objects from ${filePath}`);
    return { objects: [], hasErrors: true, errorCount: Math.max(1, lineErrors + braceErrors.length) };
}

/**
 * Alternative: Parse JSONL with a callback for each line (useful for very large files)
 */
export async function parseJsonLinesFromFileWithCallback(
    filePath: string,
    callback: (parsed: unknown, index: number) => Promise<void> | void
): Promise<{ processed: number; errors: number }> {
    const { objects, errorCount } = await parseJsonLinesFromFile(filePath);
    let processed = 0;
    for (let i = 0; i < objects.length; i++) {
        await callback(objects[i], i + 1);
        processed++;
    }
    return { processed, errors: errorCount };
}
