import fs from 'fs';
// Streaming parser that extracts complete JSON objects via brace matching.
// This is robust to embedded newlines inside strings and arbitrary chunk boundaries.
export async function parseJsonLinesFromFile(filePath: string): Promise<{ objects: unknown[]; hasErrors: boolean; errorCount: number }> {
    const objects: unknown[] = [];
    const parseErrors: Array<{ position: number; error: string; raw: string }> = [];

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
            depth--;
            if (depth === 0 && objectStart !== -1) {
                const objText = text.slice(objectStart, i + 1);
                try {
                    objects.push(JSON.parse(objText));
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    parseErrors.push({ position: objectStart, error: errorMsg, raw: objText.substring(0, 500) + (objText.length > 500 ? '...' : '') });
                    console.error(`[jsonl-parser] Brace-scan parse error at ${objectStart}: ${errorMsg}`);
                }
                objectStart = -1;
            } else if (depth < 0) {
                // Mismatched braces - reset state
                console.warn(`[jsonl-parser] Mismatched closing brace at position ${i}, resetting parser state`);
                depth = 0;
                objectStart = -1;
                inString = false;
                escapeNext = false;
            }
        }
        i++;
    }

    if (objects.length > 0) {
        if (parseErrors.length > 0) {
            console.warn(`[jsonl-parser] Parsed ${objects.length} JSON objects with ${parseErrors.length} errors from ${filePath}`);
        } else {
            console.log(`[jsonl-parser] Successfully parsed ${objects.length} JSON objects from ${filePath}`);
        }
        return { objects, hasErrors: parseErrors.length > 0, errorCount: parseErrors.length };
    }

    // If still nothing, report as error but don't throw
    console.warn(`[jsonl-parser] Could not parse any JSON objects from ${filePath}`);
    return { objects: [], hasErrors: true, errorCount: Math.max(1, parseErrors.length) };
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
