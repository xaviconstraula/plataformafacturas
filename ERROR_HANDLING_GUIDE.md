# Batch Processing Error Handling Guide

## Overview

This guide explains how errors are captured, stored, and displayed to users during batch processing of invoices.

## Components

### 1. **Error Collection & Storage**

#### In `lib/actions/invoices.ts`

- **`updateBatchProgress()`**: Updated to properly save errors to the `BatchProcessing.errors` JSON field
  - Errors are stored as an array of strings
  - Max 100 errors are kept to prevent bloat
  - Errors include the file name and error message

- **`ingestBatchOutputFromGemini()`**: Enhanced to collect and save detailed errors
  - Parses Gemini batch output line-by-line
  - Collects errors with context (line index, file name, error type)
  - Saves error summaries to the database before returning

#### In `app/api/cron/process-batches/route.ts`

- Cron job now catches ingestion errors and saves them to the database
- Sets batch status to FAILED if ingestion fails
- Stores error message in the batch record for user visibility

### 2. **Error Display Components**

#### `components/batch-errors-dialog.tsx` (NEW)

A modal dialog that displays detailed error information:

**Features:**
- Statistics dashboard showing successful, failed, and success rate
- Expandable error list with individual error messages
- Copy individual errors to clipboard
- Copy all errors at once
- Scrollable list for many errors
- Professional UI with color-coded sections

**Props:**
```typescript
interface BatchErrorsDialogProps {
    isOpen: boolean
    onClose: () => void
    batchId: string
    errors?: string[]           // Array of error messages
    failedFiles: number
    totalFiles: number
}
```

#### `components/batch-progress-banner.tsx` (UPDATED)

Enhanced to show errors on batch completion:

**Changes:**
- Now tracks which batch completed with errors
- Shows different toast notifications:
  - Success toast if all files processed successfully
  - Warning toast if some files failed (with "Ver errores" action button)
  - Error toast if batch failed completely (with "Ver errores" action button)
- Opens error dialog when user clicks "Ver errores" button
- Only reloads page if batch completed with 0 failures

**Error Handling Flow:**
```
Batch Completes
    ↓
Check if status === 'COMPLETED'
    ↓
    ├─ failedFiles > 0 → Show warning + "Ver errores" button
    ├─ failedFiles = 0 → Show success + reload after 1s
    └─ status = 'FAILED' → Show error + "Ver errores" button
```

### 3. **Data Flow**

#### File Upload → Error Collection

```
User uploads files
    ↓
createInvoiceFromFiles() processes files
    ├─ Extraction errors → collected in finalResults
    ├─ Database errors → collected with retry logic
    └─ updateBatchProgress() saves stats
    ↓
Batch created with status PENDING
```

#### Batch Processing → Error Ingestion

```
Gemini batch completes
    ↓
ingestBatchOutputFromGemini() reads results
    ├─ Parse each line
    ├─ Collect parsing errors
    ├─ Collect database errors
    ├─ Collect validation errors
    └─ updateBatchProgress() with error array
    ↓
Batch marked COMPLETED/FAILED with errors field populated
```

#### Polling → UI Updates

```
Client polls getActiveBatches() every 30s
    ↓
TanStack Query returns batch with errors field
    ↓
batch-progress-banner detects completion
    ├─ Shows appropriate toast
    ├─ User clicks "Ver errores" (if applicable)
    └─ BatchErrorsDialog opens with error details
```

## Usage Examples

### For Users

1. **Batch with partial failures:**
   - Upload 100 files
   - 95 succeed, 5 fail
   - See warning toast: "Procesamiento completado con errores - 95 facturas procesadas, 5 con errores"
   - Click "Ver errores" to see detailed error messages

2. **Complete batch failure:**
   - Upload files that exceed size limit
   - All fail at validation
   - See error toast: "Procesamiento fallido"
   - Click "Ver errores" to understand why

### For Developers

**Check errors in database:**
```typescript
const batch = await prisma.batchProcessing.findUnique({
    where: { id: batchId }
})

console.log(batch.errors) // Array of error strings
```

**Manually trigger error display:**
```typescript
// In any component using useBatchProgress hook
const { data: batches } = useBatchProgress()
const batchWithErrors = batches.find(b => b.errors && b.errors.length > 0)
// Open dialog with batchWithErrors
```

## Error Types

### Collection Phase Errors
- **PDF validation errors**: File too large, not a PDF, empty file
- **Extraction errors**: Gemini failed to extract data, invalid JSON response
- **Validation errors**: Missing required fields (invoice code, CIF, total amount)

### Processing Phase Errors
- **Provider errors**: Blocked provider, invalid CIF format
- **Material errors**: Code conflicts, duplicate materials
- **Database errors**: Unique constraint violations, connection timeouts
- **Timeout errors**: Transaction exceeds timeout, retried automatically

### Ingestion Phase Errors
- **Parsing errors**: Invalid JSON in batch output
- **Validation errors**: Extracted data doesn't match schema
- **Database errors**: Insert/update failures
- **File errors**: Cannot read batch output file

## Error Handling Best Practices

1. **Always check failedFiles count** - Don't assume all files succeeded
2. **Store errors early** - Capture errors immediately when they occur
3. **Include context** - Include file names, line numbers, and specific field info
4. **Limit error count** - Keep first 100 errors to prevent memory issues
5. **Show user-friendly messages** - Translate technical errors for non-technical users
6. **Allow export** - Let users copy errors for support tickets
7. **Retry logic** - Implement retries for transient errors (timeouts, rate limits)

## Monitoring

### Logs to Check

**Server logs:**
```
[Batch ${batchId}] Persisted ${success} invoices, ${failed} errors
[ingestBatchOutput] Detailed errors for batch ${batchId}:
[cron/process-batches] Failed to ingest results for batch ${batchId}
```

**Database queries:**
```typescript
// Find batches with errors
const failedBatches = await prisma.batchProcessing.findMany({
    where: {
        errors: { not: Prisma.DbNull },
    },
    select: { id: true, totalFiles: true, failedFiles: true, errors: true }
})
```

## Future Improvements

1. **Error categorization** - Group errors by type for better analysis
2. **Retry mechanism** - Auto-retry failed files
3. **Email notifications** - Send error summary via email
4. **Error history** - Track errors over time for patterns
5. **Smart suggestions** - Recommend fixes based on error type
6. **Batch recovery** - Ability to re-submit failed files from previous batch

## Batch Error Handling (Dialog & Persistence)

### Problem: Error Dialog Not Opening for Duplicates

**Issue**: When batch processing completed with duplicate invoices, clicking "Ver Detalles" in the error toast didn't open the error dialog.

**Root Causes**:
1. **Stale batch data**: The toast action captured `currentBatch` from the state, which could become stale
2. **State management**: The dialog was conditionally rendered based on the batch object instead of using a stable reference
3. **Duplicate counting**: Duplicate invoices were counted as "successful" even though they should be flagged as errors in the statistics

### Solutions Implemented

#### 1. **Batch ID Reference Pattern** (batch-progress-banner.tsx)
Changed from storing the entire batch object to storing just the batch ID:

```typescript
// BEFORE (Stale data problem)
const [selectedBatchForErrors, setSelectedBatchForErrors] = useState<typeof batches[0] | null>(null)

// AFTER (Always fresh)
const [selectedBatchIdForErrors, setSelectedBatchIdForErrors] = useState<string | null>(null)

// Get fresh batch data from the latest batches array
const selectedBatchForErrors = selectedBatchIdForErrors 
    ? batches.find(b => b.id === selectedBatchIdForErrors)
    : null
```

**Benefits**:
- Every time the batch data is fetched from the server, the component automatically uses the latest data
- Eliminates closure stale data issues
- Dialog always displays the most current error information

#### 2. **Proper Duplicate Invoice Counting** (lib/actions/invoices.ts)
Duplicates are now correctly included in the failed files count for statistical purposes:

```typescript
// NEW: Track duplicates separately
const duplicateInvoices = finalResultsWithBatch.filter(r => 
    r.success && r.message.includes("already exists")
);

// NEW: Include duplicates in failed count for UI
const totalFailedOrDuplicate = failedInvoices.length + duplicateInvoices.length;

await updateBatchProgress(batchId, {
    // ...
    failedFiles: totalFailedOrDuplicate,  // Now includes duplicates
    errors: batchErrors.length > 0 ? batchErrors : undefined,
});
```

**Why this works**:
- Duplicate invoices are "successful" in the sense that no error occurred
- BUT they still represent files that didn't result in NEW invoice creation
- By tracking them separately, the UI shows accurate statistics
- Error details are preserved in the `errors` array (DUPLICATE_INVOICE kind)

#### 3. **Error Persistence Flow**

The error persistence chain works as follows:

```
1. During batch processing:
   - pushBatchError() → adds to batchErrors[] array
   - Each duplicate gets: kind: 'DUPLICATE_INVOICE', message, fileName, invoiceCode, timestamp

2. After all processing:
   - updateBatchProgress(batchId, { errors: batchErrors, failedFiles: N, ... })
   - serializeBatchErrors() → converts to JSON for DB storage

3. When user queries batch status:
   - getActiveBatches() → fetches batch from DB
   - Deserializes errors from JSON back to BatchErrorDetail[]

4. When user clicks "Ver Detalles":
   - Dialog opens with fresh batch data from the query
   - Displays all errors organized by type (DUPLICATE_INVOICE, PARSING_ERROR, etc.)
```

### Database Schema

Errors are stored as JSON in the `errors` field of the `batchProcessing` table:

```json
{
  "errors": [
    {
      "kind": "DUPLICATE_INVOICE",
      "message": "Invoice INV-001 already exists for provider ACME",
      "fileName": "invoice_001.pdf",
      "invoiceCode": "INV-001",
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

**No schema changes required** - errors are stored as JSONB/JSON, allowing flexible error tracking.

### Testing the Fix

1. **Setup**: Upload PDFs with duplicate invoice codes
2. **Expected**: Batch completes with "Procesamiento completado con duplicadas" notification
3. **Action**: Click "Ver detalles"
4. **Result**: Dialog opens showing:
   - Success rate statistics
   - "Duplicadas" section with details
   - File names and invoice codes
   - Timestamps

### Error Types Handled

- `DUPLICATE_INVOICE`: Invoice code already exists for this provider
- `PARSING_ERROR`: Failed to parse AI response
- `EXTRACTION_ERROR`: Failed to extract PDF data
- `BLOCKED_PROVIDER`: Provider is in blocklist (Constraula, Sorigué)
- `DATABASE_ERROR`: Database operation failed
- `UNKNOWN`: Other errors

### Why We Don't Need Schema Changes

The current design is optimal because:

1. **Flexibility**: New error types can be added without migrations
2. **Auditing**: Complete error history is preserved in JSON
3. **Performance**: Querying recent batches doesn't require schema changes
4. **Simplicity**: JSON storage is standard practice for error logs

### Best Practices

1. **Always call `pushBatchError()`** when processing fails:
   ```typescript
   pushBatchError(batchErrors, {
       kind: 'DUPLICATE_INVOICE',
       message: `Invoice ${code} already exists`,
       fileName: file.name,
       invoiceCode: code,
   });
   ```

2. **Preserve error context**: Include fileName and invoiceCode for user debugging

3. **Use consistent error kinds**: Stick to the defined types in `BatchErrorDetail['kind']`

4. **Update batch progress with all errors**:
   ```typescript
   await updateBatchProgress(batchId, {
       // ... other updates
       errors: batchErrors.length > 0 ? batchErrors : undefined,
   });
   ```