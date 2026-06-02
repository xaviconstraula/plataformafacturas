/** Extraction output format: structured JSON (default) or legacy pipe-delimited text. */
export type ExtractFormat = 'json' | 'pipe';

export function getExtractFormat(): ExtractFormat {
    const raw = (process.env.EXTRACT_FORMAT ?? 'json').toLowerCase().trim();
    if (raw === 'pipe') return 'pipe';
    return 'json';
}

/** When item count exceeds this, extraction may be split across follow-up calls. */
export const PROACTIVE_ITEMS_PAGE_SIZE = 50;

/** Start follow-up pagination when partial response has at least this many items. */
export const MIN_ITEMS_BEFORE_FOLLOW_UP = 1;
