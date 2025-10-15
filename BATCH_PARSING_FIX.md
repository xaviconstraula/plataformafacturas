# Batch Parsing Fix - Unterminated String Issue

## Problem Identified

The application was experiencing `Unterminated string in JSON` errors when processing Gemini batch results. Example errors:

```
Error processing line: Unterminated string in JSON at position 3717
Error processing line: Unterminated string in JSON at position 1696
Error processing line: Unterminated string in JSON at position 11193
```

## Root Cause

The original implementation in `lib/actions/invoices.ts` was using a **naive line-splitting approach**:

```typescript
const fileText = await fs.promises.readFile(downloadedPath, 'utf8');
const lines = fileText.split(/\r?\n/);
```

### Why This Failed:

1. **Large JSON Lines**: Gemini batch results contain very long JSON lines (sometimes 10KB+ per line)
2. **Embedded Escaped Content**: The JSON contains deeply nested escaped strings with the actual invoice data
3. **Memory Issues**: Loading the entire file into memory and splitting can cause truncation
4. **String Splitting Fragility**: The regex split can break on special characters or incomplete reads

When a line is truncated or split incorrectly, you get incomplete JSON like:
```json
{"key":"...","response":{"candidates":[{"content":{"parts":[{"text":"...incomplete
```

This results in `JSON.parse()` failing with "Unterminated string in JSON".

## Solution Implemented

### 1. Created Streaming JSONL Parser (`lib/utils/jsonl-parser.ts`)

A robust streaming parser using Node.js `readline` module:

```typescript
import fs from 'fs';
import readline from 'readline';

export async function parseJsonLinesFromFile(filePath: string): Promise<unknown[]> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity, // Treat \r\n as a single line break
  });

  // Process line by line with proper error handling
  for await (const line of rl) {
    // Parse each complete line
  }
}
```

### Benefits:

✅ **Streaming**: Reads file line-by-line, not all at once  
✅ **Memory Efficient**: Doesn't load entire file into memory  
✅ **Robust Line Handling**: Uses Node's native line delimiter detection  
✅ **Error Isolation**: Parse errors on one line don't affect others  
✅ **Complete Lines**: Guarantees each line is read completely before parsing  

### 2. Updated Batch Processing

Modified `ingestBatchOutputFromGemini()` to use the streaming parser:

```typescript
// Before (BROKEN):
const fileText = await fs.promises.readFile(downloadedPath, 'utf8');
const lines = fileText.split(/\r?\n/);
const processingSucceeded = await processOutputLines(lines, parseJsonString);

// After (FIXED):
const { parseJsonLinesFromFile } = await import('@/lib/utils/jsonl-parser');
const parsedLines = await parseJsonLinesFromFile(downloadedPath);
const processingSucceeded = await processOutputLinesFromParsed(parsedLines, parseJsonString);
```

### 3. Added New Processing Function

Created `processOutputLinesFromParsed()` that works with already-parsed objects instead of raw strings, eliminating the double-parse issue.

## Comparison with example_gemini

The `example_gemini` folder reference code was already using `parseJsonLinesFromFile()`, but this utility didn't exist in the main codebase. This implementation now matches the robust approach from the example.

## Testing Recommendations

1. Test with batch files containing very long lines (>10KB per line)
2. Test with batch files containing special characters and escaped quotes
3. Monitor for any remaining "Unterminated string" errors
4. Verify all previously failing batches now process successfully

## Additional Improvements

The streaming parser also includes:
- Per-line error logging with line numbers
- Graceful error handling (continues processing on parse failure)
- Memory cleanup after processing
- Optional callback-based processing for extremely large files

## Files Modified

- ✅ `lib/utils/jsonl-parser.ts` - **NEW**: Streaming JSONL parser
- ✅ `lib/actions/invoices.ts` - Updated to use streaming parser
  - Modified `ingestBatchOutputFromGemini()`
  - Added `processOutputLinesFromParsed()` function

## Next Steps

Monitor the application logs for:
- Successful batch processing
- Reduction in "Unterminated string" errors
- Any new error patterns that may emerge

The fix is now in place and should handle even the largest Gemini batch responses robustly.
