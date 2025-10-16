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
