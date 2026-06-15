export { getExtractFormat, type ExtractFormat } from '@/lib/invoice-extraction/config';
export { EXTRACTED_INVOICE_JSON_SCHEMA, EXTRACTED_ITEMS_JSON_SCHEMA } from '@/lib/invoice-extraction/schema';
export { extractInvoiceJsonFromPdf } from '@/lib/invoice-extraction/extract-json';
export { parseGeminiJsonExtraction, mergeExtractedItems } from '@/lib/invoice-extraction/parse-json';
export { buildJsonExtractionPrompt } from '@/lib/invoice-extraction/prompt';
export { validateExtractedItems } from '@/lib/invoice-extraction/validate-items';
export {
    compareStoredVsExtracted,
    summarizeBatchReanalysisReport,
    type BatchReanalysisReport,
    type FieldDiff,
    type FieldDiffSeverity,
    type InvoiceComparisonResult,
    type InvoiceComparisonStatus,
    type LineDiff,
    type StoredInvoiceForComparison,
    type StoredInvoiceItemForComparison,
    isMinorDiffField,
    resolveComparisonStatus,
} from '@/lib/invoice-extraction/compare-extraction';
