import fs from 'fs';
import readline from 'readline';

/**
 * Robust JSONL (JSON Lines) parser that handles large files with streaming
 * This prevents issues with truncated lines and memory overflow
 */
export async function parseJsonLinesFromFile(filePath: string): Promise<unknown[]> {
    const results: unknown[] = [];

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity, // Treat \r\n as a single line break
    });

    let lineNumber = 0;
    const errors: Array<{ line: number; error: string; rawLine: string }> = [];

    for await (const line of rl) {
        lineNumber++;

        // Skip empty lines
        if (!line.trim()) {
            continue;
        }

        try {
            const parsed = JSON.parse(line);
            results.push(parsed);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push({
                line: lineNumber,
                error: errorMsg,
                rawLine: line.substring(0, 500) + (line.length > 500 ? '...' : ''),
            });

            // Log individual parse errors but continue processing
            console.error(`[jsonl-parser] Failed to parse line ${lineNumber}: ${errorMsg}`);
            console.error(`[jsonl-parser] Line preview: ${line.substring(0, 200)}...`);
        }
    }

    if (errors.length > 0) {
        console.warn(`[jsonl-parser] Parsed ${results.length} valid lines with ${errors.length} errors from ${filePath}`);
    } else {
        console.log(`[jsonl-parser] Successfully parsed ${results.length} lines from ${filePath}`);
    }

    return results;
}

/**
 * Alternative: Parse JSONL with a callback for each line (useful for very large files)
 */
export async function parseJsonLinesFromFileWithCallback(
    filePath: string,
    callback: (parsed: unknown, lineNumber: number) => Promise<void> | void
): Promise<{ processed: number; errors: number }> {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let processed = 0;
    let errors = 0;

    for await (const line of rl) {
        lineNumber++;

        if (!line.trim()) {
            continue;
        }

        try {
            const parsed = JSON.parse(line);
            await callback(parsed, lineNumber);
            processed++;
        } catch (err) {
            errors++;
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[jsonl-parser] Failed to parse line ${lineNumber}: ${errorMsg}`);
            console.error(`[jsonl-parser] Line preview: ${line.substring(0, 200)}...`);
        }
    }

    return { processed, errors };
}
