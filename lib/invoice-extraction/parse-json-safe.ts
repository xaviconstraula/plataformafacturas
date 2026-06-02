/** Robust JSON parse for Gemini responses (markdown fences, locale decimals, etc.). */
export function parseJsonSafe(rawInput: string): unknown {
    if (!rawInput) return null;
    let raw = rawInput.trim();
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
    }
    raw = raw.replace(/[\uFEFF\u200B-\u200D]/g, '');

    if (raw.startsWith('{\\')) {
        raw = raw
            .replace(/\\\\/g, '\x00')
            .replace(/\\"/g, '"')
            .replace(/\\\//g, '/')
            .replace(/\\b/g, '\b')
            .replace(/\\f/g, '\f')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\x00/g, '\\');
    }

    raw = raw.replace(/(\d+),(\d+)/g, '$1.$2');
    raw = raw.replace(/,\s*([}\]])/g, '$1');

    try {
        return JSON.parse(raw);
    } catch {
        console.error('[parseJsonSafe] JSON.parse failed. Preview:', raw.substring(0, 500));
    }

    try {
        if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
            const onceDecoded = JSON.parse(raw) as string;
            try {
                return JSON.parse(onceDecoded);
            } catch {
                return onceDecoded;
            }
        }
    } catch {
        /* ignore */
    }

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        try {
            return JSON.parse(raw.slice(start, end + 1));
        } catch {
            /* ignore */
        }
    }

    return null;
}
