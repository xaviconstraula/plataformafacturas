'use server'

import { prisma } from "@/lib/db";
import { type ExtractedPdfData, type ExtractedPdfItemData } from "@/lib/types/pdf";
import { Prisma, type Provider, type Material, type Invoice, type InvoiceItem, type PriceAlert, type MaterialProvider, BatchStatus } from "@/generated/prisma";
import { groupBatchesByTimeWindow as groupBatchesUtil } from "@/lib/utils/batch-grouping";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { normalizeMaterialCode, areMaterialCodesSimilar, normalizeCifForComparison, buildCifVariants } from "@/lib/utils";
import { parseJsonLinesFromFile } from "@/lib/utils/jsonl-parser";
import { requireAuth } from "@/lib/auth-utils";
import fs from "fs";
import path from "path";
import os from "os";
// ------------------------------
// Upload constraints & utilities
// ------------------------------
const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = ["application/pdf"] as const;
const MAX_FILES_PER_UPLOAD = 700;
const MAX_TOTAL_UPLOAD_BYTES = 700 * 1024 * 1024; // 500 MB per request

function validateUploadFile(file: File): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return { valid: false, error: `File is not a PDF.` };
    }
    if (typeof file.size === 'number' && file.size > MAX_UPLOAD_FILE_SIZE) {
        return { valid: false, error: `File exceeds ${Math.round(MAX_UPLOAD_FILE_SIZE / 1024 / 1024)}MB limit.` };
    }
    if (typeof file.size === 'number' && file.size === 0) {
        return { valid: false, error: `File is empty.` };
    }
    return { valid: true };
}

function isRateLimitError(error: unknown): boolean {
    const e = error as { status?: number; error?: { code?: number }; message?: string } | undefined;
    if (!e) return false;
    if (e.status === 429 || e.error?.code === 429) return true;
    if (typeof e.message === 'string') {
        const m = e.message.toLowerCase();
        if (m.includes('rate limit') || m.includes('quota exceeded')) return true;
    }
    return false;
}

function parseJsonSafe(rawInput: string): unknown {
    if (!rawInput) return null;
    let raw = rawInput.trim();
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
    }
    raw = raw.replace(/[\uFEFF\u200B-\u200D]/g, '');

    // Handle double-escaped JSON from Gemini batch responses
    if (raw.startsWith('{\\')) {
        raw = raw
            .replace(/\\\\/g, '\x00')      // Temporarily replace \\\\ with placeholder
            .replace(/\\"/g, '"')          // Unescape quotes
            .replace(/\\\//g, '/')         // Unescape forward slashes
            .replace(/\\b/g, '\b')         // Unescape backspace
            .replace(/\\f/g, '\f')         // Unescape form feed
            .replace(/\\n/g, '\n')         // Unescape newlines
            .replace(/\\r/g, '\r')         // Unescape carriage returns
            .replace(/\\t/g, '\t')         // Unescape tabs
            .replace(/\x00/g, '\\');       // Replace placeholder with actual backslash
    }

    // Replace potential comma decimals (e.g., 1,23 -> 1.23) to handle locale issues
    raw = raw.replace(/(\d+),(\d+)/g, '$1.$2');

    // New: Remove trailing commas before } or ]
    raw = raw.replace(/,\s*([}\]])/g, '$1');

    try { return JSON.parse(raw); } catch (e) {
        console.error('[parseJsonSafe] JSON.parse failed with error:', (e as SyntaxError).message, 'Raw input preview:', raw.substring(0, 500));
    }

    // Handle case where the content itself is a JSON string literal
    try {
        if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
            const onceDecoded = JSON.parse(raw) as string;
            try { return JSON.parse(onceDecoded); } catch { return onceDecoded; }
        }
    } catch { }

    // Extra robust fallback: decode escape sequences by parsing as a JSON string first,
    // then parse the decoded result as JSON.
    try {
        const quoted = '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        const decoded = JSON.parse(quoted) as string;
        return JSON.parse(decoded);
    } catch { }

    // Fallback: try to extract JSON object if possible
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        const slice = raw.slice(start, end + 1);
        try { return JSON.parse(slice); } catch { }
    }

    // Post-parse fix for "null" strings and other string literals (convert to appropriate types)
    function fixNullStrings(obj: unknown): unknown {
        if (obj === 'null') return null;
        if (obj === 'true') return true;
        if (obj === 'false') return false;
        if (typeof obj === 'object' && obj !== null) {
            const record = obj as Record<string, unknown>;
            for (const key in record) {
                record[key] = fixNullStrings(record[key]);
            }
        }
        return obj;
    }

    try {
        const parsed = JSON.parse(raw);
        return fixNullStrings(parsed);
    } catch { }

    return null;
}

function isExtractedPdfData(value: unknown): value is ExtractedPdfData {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    const provider = v.provider as Record<string, unknown> | undefined;
    const items = v.items as unknown[] | undefined;
    return typeof v.invoiceCode === 'string'
        && provider !== undefined
        && typeof provider.name === 'string'
        && typeof v.issueDate === 'string'
        && typeof v.totalAmount === 'number'
        && Array.isArray(items);
}

// Represents the minimal part of the ChatCompletion response we need when
// reading a Batch output file. Only the assistant message content is required.
interface ChatCompletionBody {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

// Gemini configuration
const GEMINI_MODEL = "gemini-2.5-flash";

// Regex helpers used to keep Gemini outputs constrained and avoid noisy payloads
const CIF_REGEX = "^(?:ES)?[A-Z0-9][A-Z0-9\\-]{5,15}$";
const ISO_DATE_REGEX = "^\\d{4}-\\d{2}-\\d{2}$";
const PHONE_REGEX = "^(?:\\+?\\d{9,15})$";
const WORK_ORDER_REGEX = "^(?:OT-)?[0-9A-Za-z]{3,12}$";

// Text-based format configuration
// Using pipe (|) as primary delimiter and semicolon (;) for nested data
// This reduces token usage by 60-70% compared to JSON schema
const TEXT_FORMAT_DELIMITER = '|';
const TEXT_FORMAT_NESTED_DELIMITER = ';';

/**
 * Parse text-based invoice extraction response from Gemini
 * 
 * Format:
 * HEADER|invoiceCode|issueDate|totalAmount
 * PROVIDER|name|cif|email|phone|address
 * ITEM|materialName|materialCode|isMaterial|quantity|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber
 * ITEM|...
 * 
 * Empty/null fields use: ~
 * 
 * Example:
 * HEADER|FAC-2024-001|2024-01-15|1250.50
 * PROVIDER|ACME S.L.|A12345678|info@acme.com|+34912345678|Calle Principal 123, Madrid
 * ITEM|Cemento Portland|CEM001|true|10.00|25.50|255.00|~|OT-4077|Cemento gris 50kg|1
 * ITEM|Transporte|~|false|1.00|995.50|995.50|2024-01-15|~|Envío especial|2
 */
function parseTextBasedExtraction(text: string, options?: { suppressWarnings?: boolean }): ExtractedPdfData | null {
    const suppressWarnings = options?.suppressWarnings ?? false;
    const lines = text.trim().split('\n');

    let invoiceCode: string | undefined = undefined;
    let issueDate: string | undefined = undefined;
    let totalAmount: number | undefined = undefined;
    let provider: ExtractedPdfData['provider'] | null = null;
    const items: ExtractedPdfItemData[] = [];

    const parseField = (value: string): string | undefined => {
        if (value === undefined || value === null) return undefined;
        const trimmed = value.trim();
        return trimmed === '~' || trimmed === '' ? undefined : trimmed;
    };

    const parseNumber = (value: string): number | undefined => {
        if (value === undefined || value === null) return undefined;
        const trimmed = value.trim();
        if (trimmed === '~' || trimmed === '') return undefined;
        const num = parseFloat(trimmed);
        return isNaN(num) ? undefined : num;
    };

    const parseBoolean = (value: string): boolean => {
        const trimmed = value.trim().toLowerCase();
        return trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue; // Skip empty lines and comments

        const parts = trimmedLine.split(TEXT_FORMAT_DELIMITER);
        const recordType = parts[0]?.toUpperCase();

        if (recordType === 'HEADER') {
            // HEADER|invoiceCode|issueDate|totalAmount
            if (parts.length < 4) {
                if (!suppressWarnings) console.warn(`Invalid HEADER line: ${trimmedLine}`);
                continue;
            }
            invoiceCode = parseField(parts[1]);
            issueDate = parseField(parts[2]);
            totalAmount = parseNumber(parts[3]);
        } else if (recordType === 'PROVIDER') {
            // PROVIDER|name|cif|email|phone|address
            if (parts.length < 6) {
                if (!suppressWarnings) console.warn(`Invalid PROVIDER line: ${trimmedLine}`);
                continue;
            }
            provider = {
                name: parseField(parts[1]) || '',
                cif: parseField(parts[2]) || '',
                email: parseField(parts[3]),
                phone: parseField(parts[4]),
                address: parseField(parts[5])
            };
        } else if (recordType === 'ITEM') {
            // ITEM|materialName|materialCode|isMaterial|quantity|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber
            // Need 11 parts total (ITEM + 10 fields)
            if (parts.length < 11) {
                if (!suppressWarnings) {
                    console.warn(`Malformed ITEM line (expected 11 parts, got ${parts.length}): ${trimmedLine}`);
                    console.warn(`This likely indicates Gemini's response was truncated. Consider processing this invoice manually.`);
                }
                continue;
            }

            const materialName = parseField(parts[1]);
            let quantity = parseNumber(parts[4]);
            let unitPrice = parseNumber(parts[5]);
            let totalPrice = parseNumber(parts[6]);

            if (!materialName) {
                if (!suppressWarnings) console.warn(`Missing required ITEM fields: ${trimmedLine}`);
                continue;
            }

            // Default quantity to 1 if missing (common in service items or single units)
            if (quantity === undefined || quantity === 0) {
                quantity = 1;
                if (!suppressWarnings) console.warn(`Defaulting quantity to 1 for item: ${materialName}`);
            }

            if ((unitPrice === undefined || isNaN(unitPrice)) && totalPrice !== undefined && !isNaN(totalPrice) && quantity > 0) {
                unitPrice = Number((totalPrice / quantity).toFixed(2));
            }

            if ((totalPrice === undefined || isNaN(totalPrice)) && unitPrice !== undefined && !isNaN(unitPrice)) {
                totalPrice = Number((unitPrice * quantity).toFixed(2));
            }

            if (unitPrice === undefined || isNaN(unitPrice)) {
                unitPrice = 0;
            }

            if (totalPrice === undefined || isNaN(totalPrice)) {
                totalPrice = 0;
            }

            unitPrice = Number(unitPrice.toFixed(2));
            totalPrice = Number(totalPrice.toFixed(2));

            items.push({
                materialName,
                materialCode: parseField(parts[2]),
                isMaterial: parseBoolean(parts[3] || 'true'),
                quantity,
                unitPrice,
                totalPrice,
                itemDate: parseField(parts[7]),
                workOrder: parseField(parts[8]),
                description: parseField(parts[9]),
                lineNumber: parseNumber(parts[10])
            });
        }
    }

    // Validate required fields
    if (!invoiceCode || !provider || !issueDate || totalAmount === undefined || items.length === 0) {
        console.error('Missing required fields in text extraction (possibly truncated Gemini response)', {
            hasInvoiceCode: !!invoiceCode,
            hasProvider: !!provider,
            hasIssueDate: !!issueDate,
            hasTotalAmount: totalAmount !== undefined,
            itemCount: items.length,
            note: items.length === 0 ? 'No items extracted - likely output truncation' : undefined
        });
        return null;
    }

    return {
        invoiceCode,
        provider,
        issueDate,
        totalAmount,
        items
    };
}

export interface BatchErrorDetail {
    kind: 'PARSING_ERROR' | 'DUPLICATE_INVOICE' | 'DATABASE_ERROR' | 'EXTRACTION_ERROR' | 'BLOCKED_PROVIDER' | 'UNKNOWN';
    message: string;
    fileName?: string;
    invoiceCode?: string;
    timestamp: string;
}

// Type for batch processing records from database (with JSON errors field)
type BatchProcessingRecord = {
    id: string;
    status: BatchStatus;
    totalFiles: number;
    processedFiles: number;
    successfulFiles: number;
    failedFiles: number;
    blockedFiles: number;
    currentFile: string | null;
    estimatedCompletion: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    errors: unknown | null; // JSON field from database
}

// Type for error entries as stored in JSON
type JsonErrorEntry = {
    kind?: string;
    message?: unknown;
    fileName?: unknown;
    invoiceCode?: unknown;
    timestamp?: unknown;
}

export interface BatchProgressInfo {
    id: string;
    status: BatchStatus;
    totalFiles: number;
    processedFiles: number;
    successfulFiles: number;
    failedFiles: number;
    blockedFiles: number;
    currentFile?: string;
    estimatedCompletion?: Date;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    errors?: BatchErrorDetail[]; // Array of error messages with metadata
}

function pushBatchError(
    target: BatchErrorDetail[],
    detail: {
        kind?: BatchErrorDetail['kind'];
        message: string;
        fileName?: string;
        invoiceCode?: string;
        timestamp?: string;
    }
): void {
    target.push({
        kind: detail.kind ?? 'UNKNOWN',
        message: detail.message,
        fileName: detail.fileName,
        invoiceCode: detail.invoiceCode,
        timestamp: detail.timestamp ?? new Date().toISOString(),
    });
}

function serializeBatchErrors(errors: BatchErrorDetail[]): Prisma.InputJsonValue {
    return errors.map(error => ({
        kind: error.kind,
        message: error.message,
        fileName: error.fileName ?? null,
        invoiceCode: error.invoiceCode ?? null,
        timestamp: error.timestamp,
    })) as Prisma.InputJsonValue;
}

// Minimal typing for Gemini batch status lookup
interface GeminiRequestCounts { total?: number; completed?: number; failed?: number }
interface GeminiBatchStatus { state?: string; request_counts?: GeminiRequestCounts; requestCounts?: GeminiRequestCounts; dest?: GeminiDest }

// Create a new batch processing record
export async function createBatchProcessing(totalFiles: number, providedId?: string, userId?: string): Promise<string> {
    const batch = await prisma.batchProcessing.create({
        data: {
            // Use providedId when supplied so that our local record id matches the external batch id.
            ...(providedId ? { id: providedId } : {}),
            totalFiles,
            status: 'PENDING',
            ...(userId ? { userId } : {}),
        },
    });
    return batch.id;
}

// Update batch processing progress
export async function updateBatchProgress(
    batchId: string,
    updates: Partial<{
        status: BatchStatus;
        processedFiles: number;
        successfulFiles: number;
        failedFiles: number;
        blockedFiles: number;
        currentFile: string;
        estimatedCompletion: Date;
        startedAt: Date;
        completedAt: Date;
        errors: BatchErrorDetail[];
    }>
): Promise<void> {
    const { errors, ...rest } = updates;
    await prisma.batchProcessing.update({
        where: { id: batchId },
        data: {
            ...rest,
            ...(errors ? { errors: serializeBatchErrors(errors) } : {}),
            updatedAt: new Date(),
        },
    });

    // Note: revalidatePath removed from here because this function is called
    // from background contexts (processBatchInBackground) where revalidatePath
    // is not allowed. Revalidation happens via TanStack Query polling instead.
}

// Get active batch processing records
export async function getActiveBatches(): Promise<BatchProgressInfo[]> {
    const user = await requireAuth();

    // Include recently completed batches (within last 15 minutes) so users have time to view errors
    // Extended from 2 minutes to 15 minutes to give users sufficient time to click "Ver detalles"
    const fifteenMinutesAgo = new Date();
    fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);

    const localBatches = await prisma.batchProcessing.findMany({
        where: {
            userId: user.id,
            OR: [
                {
                    status: {
                        in: ['PENDING', 'PROCESSING']
                    }
                },
                {
                    status: {
                        in: ['COMPLETED', 'FAILED']
                    },
                    completedAt: {
                        gte: fifteenMinutesAgo
                    }
                }
            ]
        },
        orderBy: {
            createdAt: 'desc'
        },
    });

    // 🔄  Attempt to reconcile status with Gemini for active batches
    //     We only do this for batches that are still PENDING/PROCESSING to avoid
    //     unnecessary API calls once a batch is terminal.
    const reconciledBatches: typeof localBatches = [];

    for (const batch of localBatches) {
        if (['PENDING', 'PROCESSING'].includes(batch.status)) {
            try {
                // Retry logic for batch status check
                let remote;
                let attempts = 0;
                while (attempts < 3) {
                    try {
                        remote = await gemini.batches.get({ name: batch.id }) as GeminiBatchStatus;
                        break;
                    } catch (error: unknown) {
                        attempts++;
                        if (attempts >= 3) throw error;
                        if (isRateLimitError(error)) {
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        } else {
                            throw error;
                        }
                    }
                }

                // Map Gemini state → local BatchStatus
                const state = remote?.state as string | undefined;
                const statusMap: Record<string, BatchStatus> = {
                    JOB_STATE_PENDING: 'PENDING',
                    JOB_STATE_RUNNING: 'PROCESSING',
                    JOB_STATE_SUCCEEDED: 'COMPLETED',
                    JOB_STATE_FAILED: 'FAILED',
                    JOB_STATE_EXPIRED: 'FAILED',
                    JOB_STATE_CANCELLED: 'CANCELLED',
                };
                const newStatus = state ? statusMap[state] ?? batch.status : batch.status;

                // Counts if present
                const rc = (remote?.request_counts ?? remote?.requestCounts ?? {});

                await updateBatchProgress(batch.id, {
                    status: newStatus,
                    processedFiles: rc.completed !== undefined || rc.failed !== undefined ? (rc.completed ?? 0) + (rc.failed ?? 0) : undefined,
                    successfulFiles: rc.completed,
                    failedFiles: rc.failed,
                });

                reconciledBatches.push({ ...batch, status: newStatus, processedFiles: (rc.completed ?? 0) + (rc.failed ?? 0), successfulFiles: rc.completed ?? 0, failedFiles: rc.failed ?? 0 });

                // If batch completed, ingest results
                if (newStatus === 'COMPLETED' && !batch.completedAt && remote?.dest) {
                    // Set completedAt BEFORE ingesting to prevent duplicate processing from concurrent polls
                    const now = new Date();
                    await updateBatchProgress(batch.id, {
                        completedAt: now,
                    });

                    // Now safely ingest results - concurrent polls will skip this batch due to completedAt being set
                    try {
                        await ingestBatchOutputFromGemini(batch.id, remote.dest);
                    } catch (ingestError) {
                        console.error(`[getActiveBatches] Failed to ingest batch results for ${batch.id}:`, ingestError);
                        // Mark batch as failed if ingestion fails
                        await updateBatchProgress(batch.id, {
                            status: 'FAILED',
                            errors: [
                                {
                                    kind: 'DATABASE_ERROR',
                                    message: ingestError instanceof Error ? ingestError.message : 'Failed to ingest batch results',
                                    timestamp: new Date().toISOString(),
                                },
                            ],
                        });
                    }
                }

                continue;
            } catch (err) {
                console.error('[getActiveBatches] Failed to retrieve Gemini batch', batch.id, err);
            }
        }

        reconciledBatches.push(batch);
    }

    const batches = reconciledBatches;

    return batches.map(batch => ({
        id: batch.id,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        successfulFiles: batch.successfulFiles,
        failedFiles: batch.failedFiles,
        blockedFiles: batch.blockedFiles,
        currentFile: batch.currentFile || undefined,
        estimatedCompletion: batch.estimatedCompletion || undefined,
        startedAt: batch.startedAt || undefined,
        completedAt: batch.completedAt || undefined,
        createdAt: batch.createdAt,
        errors: Array.isArray(batch.errors)
            ? (batch.errors as unknown as Array<Record<string, unknown>>).map((entry) => ({
                kind: (entry.kind as BatchErrorDetail['kind']) || 'UNKNOWN',
                message: String(entry.message ?? ''),
                fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
                invoiceCode: typeof entry.invoiceCode === 'string' ? entry.invoiceCode : undefined,
                timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
            }))
            : undefined,
    }));
}

// Get a specific batch by ID (useful for error dialog)
export async function getBatchById(batchId: string): Promise<BatchProgressInfo | null> {
    const user = await requireAuth();

    const batch = await prisma.batchProcessing.findFirst({
        where: {
            id: batchId,
            userId: user.id,
        },
    });

    if (!batch) {
        return null;
    }

    return {
        id: batch.id,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        successfulFiles: batch.successfulFiles,
        failedFiles: batch.failedFiles,
        blockedFiles: batch.blockedFiles,
        currentFile: batch.currentFile || undefined,
        estimatedCompletion: batch.estimatedCompletion || undefined,
        startedAt: batch.startedAt || undefined,
        completedAt: batch.completedAt || undefined,
        createdAt: batch.createdAt,
        errors: Array.isArray(batch.errors)
            ? (batch.errors as unknown as Array<Record<string, unknown>>).map((entry) => ({
                kind: (entry.kind as BatchErrorDetail['kind']) || 'UNKNOWN',
                message: String(entry.message ?? ''),
                fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
                invoiceCode: typeof entry.invoiceCode === 'string' ? entry.invoiceCode : undefined,
                timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
            }))
            : undefined,
    };
}

// Helper function to safely convert JSON error entry to BatchErrorDetail
function jsonErrorToBatchErrorDetail(entry: JsonErrorEntry): BatchErrorDetail {
    return {
        kind: (entry.kind as BatchErrorDetail['kind']) || 'UNKNOWN',
        message: String(entry.message ?? ''),
        fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
        invoiceCode: typeof entry.invoiceCode === 'string' ? entry.invoiceCode : undefined,
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    };
}

// Group batches that were created within a short time window (5 minutes) as they likely represent one upload session
function groupBatchesByTimeWindow(batches: BatchProcessingRecord[]): BatchProgressInfo[] {
    if (batches.length === 0) return [];

    // Sort by creation time (newest first)
    const sortedBatches = [...batches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const groupedSessions: BatchProgressInfo[] = [];
    const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    for (const batch of sortedBatches) {
        // Find if this batch belongs to an existing session
        const existingSession = groupedSessions.find(session => {
            const timeDiff = Math.abs(session.createdAt.getTime() - batch.createdAt.getTime());
            return timeDiff <= TIME_WINDOW_MS;
        });

        if (existingSession) {
            // Merge this batch into the existing session
            existingSession.totalFiles += batch.totalFiles;
            existingSession.processedFiles += batch.processedFiles;
            existingSession.successfulFiles += batch.successfulFiles;
            existingSession.failedFiles += batch.failedFiles;
            existingSession.blockedFiles += batch.blockedFiles;

            // Update status logic: if any batch is still processing/pending, session is processing
            // If all are completed but some failed, session is failed
            // If all completed successfully, session is completed
            if (batch.status === 'PROCESSING' || batch.status === 'PENDING') {
                existingSession.status = 'PROCESSING';
            } else if (batch.status === 'FAILED' && existingSession.status !== 'PROCESSING') {
                existingSession.status = 'FAILED';
            } else if (batch.status === 'COMPLETED' && existingSession.status !== 'PROCESSING' && existingSession.status !== 'FAILED') {
                existingSession.status = 'COMPLETED';
            }

            // Update timestamps
            if (!existingSession.startedAt || (batch.startedAt && batch.startedAt < existingSession.startedAt)) {
                existingSession.startedAt = batch.startedAt ?? undefined;
            }
            if (!existingSession.completedAt || (batch.completedAt && batch.completedAt > existingSession.completedAt)) {
                existingSession.completedAt = batch.completedAt ?? undefined;
            }

            // Merge errors
            if (batch.errors && Array.isArray(batch.errors)) {
                if (!existingSession.errors) existingSession.errors = [];
                existingSession.errors.push(...batch.errors.map((entry: unknown) => jsonErrorToBatchErrorDetail(entry as JsonErrorEntry)));
            }
        } else {
            // Create new session
            groupedSessions.push({
                id: `session-${batch.createdAt.getTime()}`, // Generate a unique ID for the session
                status: batch.status,
                totalFiles: batch.totalFiles,
                processedFiles: batch.processedFiles,
                successfulFiles: batch.successfulFiles,
                failedFiles: batch.failedFiles,
                blockedFiles: batch.blockedFiles,
                currentFile: batch.currentFile ?? undefined,
                estimatedCompletion: batch.estimatedCompletion ?? undefined,
                startedAt: batch.startedAt ?? undefined,
                completedAt: batch.completedAt ?? undefined,
                createdAt: batch.createdAt,
                errors: Array.isArray(batch.errors)
                    ? batch.errors.map((entry: unknown) => jsonErrorToBatchErrorDetail(entry as JsonErrorEntry))
                    : undefined,
            });
        }
    }

    // Align behavior with util (also caps to 10)
    return groupBatchesUtil(groupedSessions, { maxGroups: 10 });
}

// Get batch history for dashboard display (grouped by upload sessions)
export async function getBatchHistory(): Promise<BatchProgressInfo[]> {
    const user = await requireAuth();

    const batches = await prisma.batchProcessing.findMany({
        where: {
            userId: user.id,
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 50, // Get more batches to allow for grouping
    });

    return groupBatchesByTimeWindow(batches);
}

// Clean up old batch processing records (older than 7 days)
export async function cleanupOldBatches(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
        const result = await prisma.batchProcessing.deleteMany({
            where: {
                AND: [
                    {
                        status: {
                            in: ['COMPLETED', 'FAILED', 'CANCELLED']
                        }
                    },
                    {
                        createdAt: {
                            lt: sevenDaysAgo
                        }
                    }
                ]
            }
        });

        if (result.count > 0) {
        }
    } catch (error) {
        console.error("Error cleaning up old batch records:", error);
        // Don't throw - this is a maintenance task that shouldn't affect main processing
    }
}

// Ensure we have the Gemini API key
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable. This is required for batch AI processing.");
}

const gemini = new GoogleGenAI({ apiKey: geminiApiKey });

export interface CreateInvoiceResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    fileName?: string;
    isBlockedProvider?: boolean;
    batchId?: string; // Add batch ID to results
}

// Type for items after initial extraction and validation, before sorting
interface ExtractedFileItem {
    file: File;
    extractedData: ExtractedPdfData | null;
    error?: string; // Error during extraction or initial validation
    fileName: string; // Store filename for results
}

// Type for the result of the transaction part of processing
interface TransactionOperationResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    isExisting?: boolean; // To distinguish from new invoices
}


interface CallPdfExtractAPIResponse {
    extractedData: ExtractedPdfData | null;
    error?: string;
}




// Function to normalize provider names for comparison
function normalizeProviderName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]/g, '') // Remove special characters and spaces
        .trim();
}

// Function to check if two provider names are similar
function areProviderNamesSimilar(name1: string, name2: string): boolean {
    const normalized1 = normalizeProviderName(name1);
    const normalized2 = normalizeProviderName(name2);

    // Check for exact match
    if (normalized1 === normalized2) return true;

    // Check if one name contains the other (for cases like "ACME S.L." vs "ACME SOCIEDAD LIMITADA")
    if (normalized1.length > 3 && normalized2.length > 3) {
        return normalized1.includes(normalized2) || normalized2.includes(normalized1);
    }

    return false;
}

// Function to check if a provider should be ignored
function isBlockedProvider(providerName: string): boolean {
    const normalizedName = normalizeProviderName(providerName);

    const blockedProviders = [
        'constraula',
        'sorigué',
        'sorigüe',
        'soriguè',
        'soriguê',
        'sorigui'
    ].map(name => normalizeProviderName(name));

    return blockedProviders.some(blocked => normalizedName.includes(blocked));
}


// Helper to build the extraction prompt
function buildExtractionPrompt(startFromItemNumber?: number): string {
    const itemStartInstruction = startFromItemNumber
        ? `\n\nIMPORTANT: Start extracting items from line item #${startFromItemNumber} onwards. Do NOT re-extract items before #${startFromItemNumber}. The HEADER and PROVIDER lines should be omitted - only output ITEM lines.`
        : '';

    return `Extract invoice data from this PDF document (consolidate all pages into a single invoice). Only extract visible data.${itemStartInstruction}

CRITICAL NUMBER ACCURACY:
- Distinguish 5 vs S (flat top vs curved), 8 vs B (complete vs open), 0 vs O vs 6 (oval vs round vs curved)
- Double-check all digit sequences, especially CIF/NIF numbers
- Verify quantities and codes character by character

PROVIDER (Invoice Issuer - NOT the client):
- Find company at TOP of invoice, labeled "Vendedor/Proveedor/Emisor"
- Extract: name, tax ID, email, phone, address
- Constraula or Sorigué are NEVER the provider (they are the client)

TAX ID (CIF/NIF/NIE) - EXTREMELY IMPORTANT:
- CIF format: Letter + exactly 8 digits (e.g., A12345678)
- NIF format: exactly 8 digits + Letter (e.g., 12345678A)
- NIE format: X/Y/Z + exactly 7 digits + Letter (e.g., X1234567A)
- Look for labels: "CIF:", "NIF:", "Cód. Fiscal:", "Tax ID:", "RFC:"
- VERIFY digit count is correct (8 for CIF/NIF, 7 for NIE)

PHONE NUMBER:
- Spanish format: 6/7/8/9 + 8 more digits (9 total)
- May have +34 country code
- Look for labels: "Tel:", "Teléfono:", "Phone:"

INVOICE: Extract code, issue date (ISO format YYYY-MM-DD), total amount

LINE ITEMS (extract ALL items from all pages, only actual materials/services, not labels like "Albarán"):
CRITICAL: Process every visible line item you can find. If uncertain about any field, use reasonable defaults rather than omitting the item.
- materialName: Use descriptive name
- materialCode: Extract product reference code ONLY if clearly visible in a column like "Código", "Ref.", "Artículo". If not present, use ~
- isMaterial: true for physical items, false for services/fees/taxes
- quantity: Number of units/items ordered (default to 1.00 if not clearly visible in the PDF)
- unitPrice: Price per unit (extract from columns labeled "Precio", "PVP", "Precio unit.", "Base", "Importe unitario", "Precio unitario", "EUROS", "€")
- totalPrice: Total amount for this line (quantity x unitPrice, extract from columns labeled "Total", "Importe", "Subtotal", "Total línea", "Base imponible", "Importe total")
- CRITICAL: Always extract prices as numbers with 2 decimals (e.g., 25.50, not 25,50). If you see a price, extract it - do NOT use ~ unless the column is completely missing
- CRITICAL: For quantity, if not visible in the PDF, use 1.00 (most items are single units)
- CRITICAL: Ensure ALL 11 fields are present for every ITEM line - never omit fields
- itemDate: ISO format if different from invoice date, otherwise ~
- workOrder: Simple 3-5 digit OT number (e.g., "Obra: 4077" → "OT-4077"). If not present, use ~
- description: Brief description, otherwise ~
- lineNumber: Line number if visible, otherwise ~

OUTPUT FORMAT - Use pipe (|) as delimiter:
For missing/null values, use: ~

IMPORTANT: Each line type must have EXACTLY the specified number of fields!

Line 1 - HEADER (exactly 4 fields):
HEADER|invoiceCode|issueDate|totalAmount

Line 2 - PROVIDER (exactly 6 fields):
PROVIDER|name|cif|email|phone|address

Lines 3+ - ITEMS (exactly 11 fields per line):
ITEM|materialName|materialCode|isMaterial|quantity|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber

CRITICAL FORMATTING REQUIREMENTS:
- Output ONLY the structured lines, no explanations or comments
- Each line must start with HEADER, PROVIDER, or ITEM
- HEADER line: exactly 4 fields (HEADER|invoiceCode|issueDate|totalAmount)
- PROVIDER line: exactly 6 fields (PROVIDER|name|cif|email|phone|address)
- ITEM line: exactly 11 fields (ITEM|materialName|materialCode|isMaterial|quantity|unitPrice|totalPrice|itemDate|workOrder|description|lineNumber)
- Use pipe (|) to separate fields within each line - NO SPACES around pipes
- Use tilde (~) for empty/null fields - NO SPACES around tildes
- Numbers must use dot (.) as decimal separator, never comma (e.g., 1234.56 not 1,234.56)
- No thousand separators (write 1234.56 not 1,234.56)
- Boolean isMaterial: use "true" or "false" (lowercase, no quotes)
- For prices: Extract actual numeric values from the PDF. Only use ~ if no price column exists at all in the invoice table
- Do NOT include pipes (|) or newlines in field values
- Do NOT add extra spaces or formatting - keep output clean and minimal
- NEVER output incomplete lines - all fields must be present for each record type
- FAILURE TO FOLLOW EXACT FIELD COUNTS WILL RESULT IN PROCESSING ERRORS

EXAMPLE OUTPUT:
HEADER|FAC-2024-001|2024-01-15|1250.50
PROVIDER|ACME S.L.|A12345678|info@acme.com|+34912345678|Calle Principal 123, Madrid
ITEM|Cemento Portland|CEM001|true|10.00|25.50|255.00|~|OT-4077|Cemento gris 50kg|1
ITEM|Transporte|~|false|1.00|995.50|995.50|2024-01-15|~|Envío especial|2

REMEMBER: Every ITEM line must have exactly 11 pipe-separated fields. Use defaults when uncertain.`;
}

async function callPdfExtractAPI(file: File, batchErrors: BatchErrorDetail[]): Promise<CallPdfExtractAPIResponse> {
    try {
        const validation = validateUploadFile(file);
        if (!validation.valid) {
            console.warn(`Validation failed for ${file.name}: ${validation.error}`);
            return { extractedData: null, error: validation.error };
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');

        // Build prompt for direct PDF processing with text-based output
        const promptText = buildExtractionPrompt();

        const result = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: 'application/pdf', data: base64 } }
                    ]
                }
            ],
            config: {
                temperature: 0.8,
                maxOutputTokens: 65536,
                candidateCount: 1
            }
        });

        let text = (
            result.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
        );

        if (!text) {
            console.error(`No content in Gemini response for ${file.name}`);
            const errorMessage = "No content from Gemini.";
            pushBatchError(batchErrors, {
                kind: 'EXTRACTION_ERROR',
                message: errorMessage,
                fileName: file.name,
            });
            return { extractedData: null, error: errorMessage };
        }

        // Check for MAX_TOKENS truncation
        const finishReason = result.candidates?.[0]?.finishReason as string | undefined;
        if (finishReason === 'MAX_TOKENS') {
            console.warn(`[${file.name}] Response truncated due to MAX_TOKENS. Attempting to extract remaining items...`);

            // Parse what we have so far to identify the last successfully extracted item
            const partialData = parseTextBasedExtraction(text);
            if (partialData && partialData.items && partialData.items.length > 0) {
                const lastItemNumber = partialData.items[partialData.items.length - 1].lineNumber || partialData.items.length;
                console.log(`[${file.name}] Last extracted item: #${lastItemNumber}. Requesting remaining items...`);

                try {
                    // Make follow-up call for remaining items
                    const followUpPrompt = buildExtractionPrompt(Number(lastItemNumber) + 1);
                    const followUpResult = await gemini.models.generateContent({
                        model: GEMINI_MODEL,
                        contents: [
                            {
                                role: 'user',
                                parts: [
                                    { text: followUpPrompt },
                                    { inlineData: { mimeType: 'application/pdf', data: base64 } }
                                ]
                            }
                        ],
                        config: {
                            temperature: 0.8,
                            maxOutputTokens: 65536,
                            candidateCount: 1
                        }
                    });

                    const followUpText = (
                        followUpResult.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
                    );

                    if (followUpText && followUpText.includes('ITEM|')) {
                        // Extract only ITEM lines from follow-up
                        const followUpItems = followUpText.split('\n')
                            .filter(line => line.trim().startsWith('ITEM|'))
                            .join('\n');

                        // Merge: original text (with HEADER, PROVIDER, and initial items) + follow-up items
                        text = text + '\n' + followUpItems;
                        console.log(`[${file.name}] Successfully merged follow-up extraction. Added ${followUpItems.split('\n').length} additional items.`);
                    } else {
                        console.warn(`[${file.name}] Follow-up extraction returned no items. Using partial data.`);
                    }
                } catch (followUpError) {
                    console.error(`[${file.name}] Follow-up extraction failed:`, followUpError);
                    // Continue with partial data - better than nothing
                }
            } else {
                console.warn(`[${file.name}] Could not parse partial data to determine last item. Using truncated response as-is.`);
            }
        }

        try {
            const extractedData = parseTextBasedExtraction(text);

            if (!extractedData) {
                // Check if response looks truncated (ends mid-line or has incomplete items)
                const looksLikeTruncation = text.includes('ITEM|') &&
                    (text.split('\n').some(line => {
                        const trimmed = line.trim();
                        return trimmed.startsWith('ITEM|') && trimmed.split('|').length < 11;
                    }) || !text.trim().endsWith('}'));

                const errorMsg = looksLikeTruncation
                    ? 'AI response appears truncated (incomplete items). The invoice may have too many items. Try processing manually or splitting into smaller invoices.'
                    : 'Invalid AI response format.';

                console.warn(`Failed to parse text-based response for ${file.name}: ${errorMsg}`);
                pushBatchError(batchErrors, {
                    kind: looksLikeTruncation ? 'EXTRACTION_ERROR' : 'PARSING_ERROR',
                    message: errorMsg,
                    fileName: file.name,
                });
                return { extractedData: null, error: errorMsg };
            }

            if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                console.warn(`Response for ${file.name} missing crucial invoice-level data. Data: ${JSON.stringify(extractedData)}`);
            }
            if (!extractedData.items || extractedData.items.length === 0) {
                console.warn(`File ${file.name} yielded invoice-level data but no line items were extracted by AI.`);
            }

            return { extractedData };

        } catch (parseError) {
            console.error(`Error parsing Gemini response for ${file.name}:`, parseError);
            pushBatchError(batchErrors, {
                kind: 'EXTRACTION_ERROR',
                message: `Error parsing Gemini response: ${(parseError as Error).message}`,
                fileName: file.name,
            });
            return { extractedData: null, error: "Error parsing Gemini response." };
        }

    } catch (error) {
        console.error(`Error extracting data from PDF ${file.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error during PDF extraction.";
        pushBatchError(batchErrors, {
            kind: 'EXTRACTION_ERROR',
            message: errorMessage,
            fileName: file.name,
        });
        return { extractedData: null, error: errorMessage };
    }
}

async function findOrCreateProviderTx(tx: Prisma.TransactionClient, providerData: ExtractedPdfData['provider'], userId?: string, providerType: 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL' = 'MATERIAL_SUPPLIER'): Promise<Provider> {
    const { cif, name, email, phone, address } = providerData;
    const canonicalCif = normalizeCifForComparison(cif) || cif;

    // Check if provider is blocked
    if (isBlockedProvider(name)) {
        const error = new Error(`Provider '${name}' is blocked and cannot be processed.`);
        (error as Error & { isBlockedProvider: boolean }).isBlockedProvider = true;
        throw error;
    }

    // Ensure CIF is available for provider unification
    if (!cif) {
        throw new Error(`Provider tax ID (CIF/NIF) is required to process invoices for '${name}'.`);
    }

    try {
        let existingProvider: Provider | null = null;
        let matchType = '';

        // Strategy 1: Robust CIF matching (normalize hyphens and ES prefix)
        const normalized = normalizeCifForComparison(cif);
        const variants = buildCifVariants(cif);

        // 1a. Try direct or normalized variant matches within current user's scope
        if (userId) {
            existingProvider = await tx.provider.findFirst({
                where: {
                    userId,
                    OR: [
                        { cif: { in: variants } },
                        // Fallback: provider.cif normalized equals normalized input (approximate via contains both ways)
                        { cif: { contains: normalized ?? '', mode: Prisma.QueryMode.insensitive } }
                    ]
                }
            });
        } else {
            existingProvider = await tx.provider.findFirst({
                where: {
                    OR: [
                        { cif: { in: variants } },
                        { cif: { contains: normalized ?? '', mode: Prisma.QueryMode.insensitive } }
                    ]
                }
            });
        }

        // 1b. Si no existe, buscar alias (also scoped by user if userId provided)
        if (!existingProvider) {
            const aliasFilter = userId ? {
                OR: [
                    { cif: { in: variants } },
                    ...(normalized ? [{ cif: { contains: normalized, mode: Prisma.QueryMode.insensitive } }] : [])
                ],
                provider: { is: { userId } }
            } : {
                OR: [
                    { cif: { in: variants } },
                    ...(normalized ? [{ cif: { contains: normalized, mode: Prisma.QueryMode.insensitive } }] : [])
                ]
            };

            const alias = await tx.providerAlias.findFirst({
                where: aliasFilter as Prisma.ProviderAliasWhereInput,
                include: { provider: true }
            });
            if (alias) {
                existingProvider = alias.provider;
                if (existingProvider) {
                    matchType = 'CIF alias';
                }
            }
        }

        if (existingProvider) {
            if (!matchType) matchType = 'CIF match';
        } else {
            // Strategy 2: Find by exact name match (case insensitive, scoped by user if userId provided)
            const nameFilter = userId ? {
                userId,
                name: {
                    equals: name,
                    mode: 'insensitive' as const
                }
            } : {
                name: {
                    equals: name,
                    mode: 'insensitive' as const
                }
            };

            existingProvider = await tx.provider.findFirst({
                where: nameFilter,
            });

            if (existingProvider) {
                matchType = 'exact name';
            } else if (phone) {
                // Strategy 3: Find by phone number (scoped by user if userId provided)
                const phoneFilter = userId ? {
                    userId,
                    phone: phone
                } : {
                    phone: phone
                };

                existingProvider = await tx.provider.findFirst({
                    where: phoneFilter,
                });

                if (existingProvider) {
                    matchType = 'phone number';
                } else {
                    // Strategy 4: Find by similar name (scoped by user if userId provided)
                    const allProvidersFilter = userId ? { userId } : {};
                    const allProviders = await tx.provider.findMany({
                        where: allProvidersFilter
                    });

                    for (const candidate of allProviders) {
                        if (areProviderNamesSimilar(name, candidate.name)) {
                            existingProvider = candidate;
                            matchType = 'similar name';
                            break;
                        }
                    }
                }
            }
        }

        // If we found an existing provider, update it with the latest information
        if (existingProvider) {
            const updatedProvider = await tx.provider.update({
                where: { id: existingProvider.id },
                data: {
                    name, // Always update name to keep it current
                    cif: canonicalCif, // Persist canonical normalized CIF
                    email: email || existingProvider.email, // Keep new email if provided, otherwise keep existing
                    phone: phone || existingProvider.phone, // Keep new phone if provided, otherwise keep existing
                    address: address || existingProvider.address, // Keep new address if provided, otherwise keep existing
                    type: providerType, // Update type if needed
                }
            });

            return updatedProvider;
        }

        // No existing provider found, create a new one

        // Since we already checked for existence scoped by user, we can create directly
        let createData: Prisma.ProviderCreateInput = {
            // Persist normalized canonical version
            cif: canonicalCif,
            name,
            email,
            phone,
            address,
            type: providerType,
        };

        // Only add user connection if userId provided (for user-scoped operations)
        if (userId) {
            createData = {
                ...createData,
                user: {
                    connect: { id: userId }
                }
            };
        }

        const newProvider = await tx.provider.create({
            data: createData,
        });

        return newProvider;

    } catch (error) {
        // Handle unique constraint violations that might still occur due to race conditions
        if (typeof error === 'object' && error !== null && 'code' in error &&
            (error as { code: string }).code === 'P2002') {

            // P2002 means a unique constraint was violated, likely the CIF
            // Another transaction might have created a provider with this CIF or a similar one
            // Do a comprehensive search to find the existing provider

            // 1. Try exact CIF match first (scoped by user if userId provided)
            const cifFilter = userId ? { cif, userId } : { cif };
            let existingProvider = await tx.provider.findFirst({
                where: cifFilter,
            });

            if (existingProvider) {
                return existingProvider;
            }

            // 2. If not found by CIF, search by name (scoped by user if userId provided)
            const nameFilter = userId ? {
                userId,
                name: {
                    equals: name,
                    mode: 'insensitive' as const
                }
            } : {
                name: {
                    equals: name,
                    mode: 'insensitive' as const
                }
            };

            existingProvider = await tx.provider.findFirst({
                where: nameFilter,
            });

            if (existingProvider) {
                // Update the existing provider with the new CIF if needed
                const updatedProvider = await tx.provider.update({
                    where: { id: existingProvider.id },
                    data: {
                        cif, // Update with the CIF from current transaction
                        email: email || existingProvider.email,
                        phone: phone || existingProvider.phone,
                        address: address || existingProvider.address,
                        type: providerType,
                    }
                });
                return updatedProvider;
            }

            // 3. Search by phone if available (scoped by user if userId provided)
            if (phone) {
                const phoneFilter = userId ? {
                    userId,
                    phone: phone
                } : {
                    phone: phone
                };

                existingProvider = await tx.provider.findFirst({
                    where: phoneFilter,
                });

                if (existingProvider) {
                    const updatedProvider = await tx.provider.update({
                        where: { id: existingProvider.id },
                        data: {
                            cif,
                            name,
                            email: email || existingProvider.email,
                            phone: phone || existingProvider.phone,
                            address: address || existingProvider.address,
                            type: providerType,
                        }
                    });
                    return updatedProvider;
                }
            }

            // 4. Search by similar name as last resort (scoped by user if provided)
            const allProviders = await tx.provider.findMany({
                where: userId ? { userId } : undefined
            });
            for (const candidate of allProviders) {
                if (areProviderNamesSimilar(name, candidate.name)) {
                    const updatedProvider = await tx.provider.update({
                        where: { id: candidate.id },
                        data: {
                            cif,
                            name,
                            email: email || candidate.email,
                            phone: phone || candidate.phone,
                            address: address || candidate.address,
                            type: providerType,
                        }
                    });
                    return updatedProvider;
                }
            }

            // If we still haven't found anything, the race condition might have resolved
            // Try one more time to create the provider
            throw error; // Re-throw to let the caller handle it
        }

        // Re-throw other errors
        throw error;
    }
}

// Optimized material finding function that uses cache when available
async function findOrCreateMaterialTxWithCache(
    tx: Prisma.TransactionClient,
    materialName: string,
    materialCode?: string,
    providerType?: string,
    materialCache?: Map<string, { id: string; name: string; code: string; referenceCode: string | null; category: string | null }>,
    userId?: string,
): Promise<Material> {
    const normalizedName = materialName.trim();

    // Priorizar el código extraído del PDF por Gemini
    // Handle case where AI returns string 'null' instead of null
    const finalCode: string | null = materialCode && materialCode !== 'null' ? normalizeMaterialCode(materialCode) : null;

    // Try cache first if available
    if (materialCache) {
        // Search by code first
        if (finalCode) {
            const cachedByCode = materialCache.get(`code:${finalCode}`);
            if (cachedByCode) {
                return await tx.material.findUnique({ where: { id: cachedByCode.id } }) as Material;
            }

            const cachedByRef = materialCache.get(`ref:${finalCode}`);
            if (cachedByRef) {
                return await tx.material.findUnique({ where: { id: cachedByRef.id } }) as Material;
            }
        }

        // Search by name
        const cachedByName = materialCache.get(`name:${normalizedName.toLowerCase()}`);
        if (cachedByName) {
            return await tx.material.findUnique({ where: { id: cachedByName.id } }) as Material;
        }

        // Check for similar codes in cache if finalCode is long enough
        if (finalCode && finalCode.length >= 6) {
            for (const [key, cachedMaterial] of materialCache.entries()) {
                if (key.startsWith('code:') || key.startsWith('ref:')) {
                    const cacheCode = key.substring(key.indexOf(':') + 1);
                    if (areMaterialCodesSimilar(finalCode, cacheCode)) {
                        return await tx.material.findUnique({ where: { id: cachedMaterial.id } }) as Material;
                    }
                }
            }
        }
    }

    // Fall back to original database lookup logic (scoped by user)
    return await findOrCreateMaterialTx(tx, materialName, materialCode, providerType, userId);
}

async function findOrCreateMaterialTx(tx: Prisma.TransactionClient, materialName: string, materialCode?: string, providerType?: string, userId?: string): Promise<Material> {
    const normalizedName = materialName.trim();
    let material: Material | null = null;

    // Priorizar el código extraído del PDF por Gemini
    // Handle case where AI returns string 'null' instead of null
    const finalCode: string | null = materialCode && materialCode !== 'null' ? normalizeMaterialCode(materialCode) : null;

    // Buscar primero por código exacto
    if (finalCode) {
        material = await tx.material.findFirst({
            where: { code: finalCode, userId: userId ?? undefined },
        });

        if (material) {
            return material;
        }
    }

    // Si no se encuentra por código exacto, buscar por referenceCode
    if (finalCode) {
        material = await tx.material.findFirst({
            where: { referenceCode: finalCode, userId: userId ?? undefined }
        });

        if (material) {
            return material;
        }
    }

    // Buscar por nombre exacto
    material = await tx.material.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' }, userId: userId ?? undefined }
    });

    if (material) {
        return material;
    }

    // Solo si no encontramos nada, hacer búsqueda por similitud (más conservadora)
    if (finalCode && finalCode.length >= 6) {
        const allMaterials = await tx.material.findMany({
            where: { userId: userId ?? undefined },
            select: { id: true, name: true, code: true, referenceCode: true, category: true }
        });

        for (const existingMaterial of allMaterials) {
            // Verificar similitud por código solo si ambos códigos son largos
            if (existingMaterial.code && areMaterialCodesSimilar(finalCode, existingMaterial.code)) {
                material = await tx.material.findUnique({
                    where: { id: existingMaterial.id }
                });
                break;
            }

            // También verificar con referenceCode
            if (existingMaterial.referenceCode && areMaterialCodesSimilar(finalCode, existingMaterial.referenceCode)) {
                material = await tx.material.findUnique({
                    where: { id: existingMaterial.id }
                });
                break;
            }
        }
    }

    // Set category based on provider type
    const category = providerType === 'MACHINERY_RENTAL' ? 'Alquiler Maquinaria' : 'Proveedor de Materiales';

    if (!material) {
        // Generate a base code
        const baseCode = (materialCode && materialCode !== 'null') ? materialCode : normalizedName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, '-')
            .substring(0, 45); // Leave room for suffix

        // Try to create with base code first, then with suffixes if needed
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const codeToTry = attempts === 0 ? baseCode : `${baseCode}-${attempts}`;

            // First, check if a material with this code already exists to avoid the unique constraint violation
            // which would abort the entire transaction.
            const existingMaterialWithCode = await tx.material.findFirst({
                where: { code: codeToTry, userId: userId ?? undefined },
                select: { id: true }, // Lightweight query
            });

            if (existingMaterialWithCode) {
                attempts++;
                continue; // Move to the next attempt with a new suffix
            }

            try {
                material = await tx.material.create({
                    data: {
                        code: codeToTry,
                        name: normalizedName,
                        category: category,
                        referenceCode: materialCode && materialCode !== 'null' ? materialCode : null, // Keep original code from PDF, but not string 'null'
                        ...(userId ? { user: { connect: { id: userId } } } : {}),
                    },
                });
                break; // Success, exit loop
            } catch (error) {
                // This catch block now primarily handles race conditions, where another
                // transaction created a material with the same code *after* our check but *before* our create.
                if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
                    attempts++;
                    // The loop will continue, and our check at the top will now find the conflicting material.
                } else {
                    // For any other error, we must re-throw to abort the transaction.
                    throw error;
                }
            }
        }

        if (!material) {
            // If the loop finishes without creating a material, it means all attempts to generate a unique code failed.
            // This is highly unlikely but possible under heavy concurrency.
            // As a final fallback, try to find the material by its name, as it might have been created by another transaction.
            const existingMaterial = await tx.material.findFirst({
                where: { name: { equals: normalizedName, mode: 'insensitive' } }
            });

            if (existingMaterial) {
                return existingMaterial;
            }

            throw new Error(`Could not create material '${normalizedName}' due to a temporary code conflict. Please try again.`);
        }
    } else {
        // Update category if not set or different
        if (!material.category || material.category !== category) {
            material = await tx.material.update({
                where: { id: material.id },
                data: { category: category },
            });
        }
    }
    return material;
}

async function processInvoiceItemTx(
    tx: Prisma.TransactionClient,
    itemData: ExtractedPdfItemData,
    invoiceId: string,
    invoiceIssueDate: Date,
    providerId: string,
    createdMaterial: Material,
    isMaterialItem: boolean
): Promise<{ invoiceItem: InvoiceItem; alert?: PriceAlert }> {
    const { quantity, unitPrice, totalPrice, itemDate } = itemData;

    if (typeof quantity !== 'number' || isNaN(quantity) ||
        typeof unitPrice !== 'number' || isNaN(unitPrice) ||
        typeof totalPrice !== 'number' || isNaN(totalPrice)) {
        throw new Error(`Invalid item data: quantity=${quantity}, unitPrice=${unitPrice}, totalPrice=${totalPrice}`);
    }

    const quantityDecimal = new Prisma.Decimal(quantity.toFixed(2));
    const currentUnitPriceDecimal = new Prisma.Decimal(unitPrice.toFixed(2));
    const totalPriceDecimal = new Prisma.Decimal(totalPrice.toFixed(2));

    // Use itemDate if provided, otherwise use invoice issue date
    const effectiveDate = itemDate ? new Date(itemDate) : invoiceIssueDate;



    const invoiceItem = await tx.invoiceItem.create({
        data: {
            invoiceId,
            materialId: createdMaterial.id,
            quantity: quantityDecimal,
            unitPrice: currentUnitPriceDecimal,
            totalPrice: totalPriceDecimal,
            itemDate: effectiveDate, // Store the effective date for the item
            workOrder: itemData.workOrder || null,
            description: itemData.description || null,
            lineNumber: itemData.lineNumber || null,
        },
    });

    let alert: PriceAlert | undefined;

    // Only perform price alert checks and MaterialProvider updates if it's a material
    if (isMaterialItem) {
        // Find the chronologically previous invoice item for this material and provider
        const previousInvoiceItemRecord = await tx.invoiceItem.findFirst({
            where: {
                materialId: createdMaterial.id,
                invoice: {
                    providerId: providerId,
                },
                itemDate: { lt: effectiveDate }, // Use itemDate for comparison
                NOT: {
                    id: invoiceItem.id
                }
            },
            orderBy: { itemDate: 'desc' }, // Order by itemDate instead of invoice.issueDate
            select: { unitPrice: true, itemDate: true }
        });

        if (previousInvoiceItemRecord) {
            const previousPrice = previousInvoiceItemRecord.unitPrice;

            if (!currentUnitPriceDecimal.equals(previousPrice)) {
                const priceDiff = currentUnitPriceDecimal.minus(previousPrice);
                let percentageChangeDecimal: Prisma.Decimal;

                if (!previousPrice.isZero()) {
                    percentageChangeDecimal = priceDiff.dividedBy(previousPrice).times(100);
                } else {
                    percentageChangeDecimal = new Prisma.Decimal(currentUnitPriceDecimal.isPositive() ? 9999 : -9999);
                }

                // Verificar si ya existe una alerta para el mismo material, proveedor y fecha
                const existingAlert = await tx.priceAlert.findFirst({
                    where: {
                        materialId: createdMaterial.id,
                        providerId,
                        effectiveDate,
                    },
                });

                if (!existingAlert) {
                    try {
                        alert = await tx.priceAlert.create({
                            data: {
                                materialId: createdMaterial.id,
                                providerId,
                                oldPrice: previousPrice,
                                newPrice: currentUnitPriceDecimal,
                                percentage: percentageChangeDecimal,
                                status: "PENDING",
                                effectiveDate,
                                invoiceId,
                            },
                        });

                    } catch (alertError) {
                        // Manejar error de constraint único
                        if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                            (alertError as { code: string }).code === 'P2002') {
                            // Price alert already exists (constraint violation). Skipping duplicate creation.
                        } else {
                            // Re-lanzar otros errores
                            throw alertError;
                        }
                    }
                }
            }
        }

        // Update MaterialProvider to reflect the price from the item with the LATEST date
        const materialProvider = await tx.materialProvider.findUnique({
            where: {
                materialId_providerId: {
                    materialId: createdMaterial.id,
                    providerId,
                },
            },
        });

        if (materialProvider) {
            if (!materialProvider.lastPriceDate || effectiveDate.getTime() > materialProvider.lastPriceDate.getTime()) {
                if (!materialProvider.lastPrice.equals(currentUnitPriceDecimal) || (materialProvider.lastPriceDate && effectiveDate.getTime() !== materialProvider.lastPriceDate.getTime()) || !materialProvider.lastPriceDate) {
                    await tx.materialProvider.update({
                        where: { id: materialProvider.id },
                        data: {
                            lastPrice: currentUnitPriceDecimal,
                            lastPriceDate: effectiveDate,
                        },
                    });
                }
            }
        } else {

            await tx.materialProvider.create({
                data: {
                    materialId: createdMaterial.id,
                    providerId,
                    lastPrice: currentUnitPriceDecimal,
                    lastPriceDate: effectiveDate,
                },
            });
        }
    }

    return { invoiceItem, alert };
}

// Enhanced rate limit handling with exponential backoff
async function callPdfExtractAPIWithRetry(file: File, batchErrors: BatchErrorDetail[], maxRetries: number = 3): Promise<CallPdfExtractAPIResponse> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await callPdfExtractAPI(file, batchErrors);
            return result;

        } catch (error) {
            lastError = error;
            console.error(`[Attempt ${attempt}/${maxRetries}] Error calling PDF extract API for ${file.name}:`, error);

            // Check if it's a rate limit error
            const isRateLimitError = error instanceof Error &&
                (error.message.includes('429') || error.message.toLowerCase().includes('rate limit') ||
                    error.message.toLowerCase().includes('quota exceeded'));

            if (isRateLimitError && attempt < maxRetries) {
                // Simple backoff for rate limits
                const backoffTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000); // 2s, 4s, 8s, max 30s
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
            }

            // For non-rate-limit errors, retry with minimal delay
            if (!isRateLimitError && attempt < maxRetries) {
                const quickRetryDelay = 1000 * attempt; // 1s, 2s for attempts 1, 2
                await new Promise(resolve => setTimeout(resolve, quickRetryDelay));
                continue;
            }

            // If it's the last attempt or not retryable, break
            break;
        }
    }

    // If we get here, all retries failed
    const errorMessage = lastError instanceof Error ? lastError.message : "Unknown error during PDF extraction with retries.";
    return {
        extractedData: null,
        error: `Failed after ${maxRetries} attempts: ${errorMessage}`
    };
}

export async function createInvoiceFromFiles(
    formDataWithFiles: FormData
): Promise<{ overallSuccess: boolean; results: CreateInvoiceResult[]; batchId: string }> {
    const files = formDataWithFiles.getAll("files") as File[];
    if (!files || files.length === 0) {
        throw new Error("No files provided.");
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
        throw new Error(`Too many files. Maximum allowed is ${MAX_FILES_PER_UPLOAD}.`);
    }
    const totalBytes = files.reduce((sum, f) => sum + (typeof f.size === 'number' ? f.size : 0), 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new Error(`Total upload size exceeds ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }

    // Identify the current authenticated user so that all subsequent
    // provider/invoice creations are correctly scoped. Without this the UI
    // queries (which filter by userId) may fail to find newly created records
    // leading to the appearance that invoices "disappear".
    const user = await requireAuth();

    // Check if an existing batch ID was provided, otherwise create a new one
    const existingBatchId = formDataWithFiles.get("existingBatchId") as string | null;
    let batchId: string;

    if (existingBatchId) {
        batchId = existingBatchId;
    } else {
        // Create new batch processing record (fallback for backward compatibility)
        batchId = await createBatchProcessing(files.length, undefined, user.id);
    }

    // Start batch processing
    await updateBatchProgress(batchId, {
        status: 'PROCESSING',
        startedAt: new Date(),
    });

    // More conservative initial concurrency for larger batches
    let CONCURRENCY_LIMIT = files.length > 10 ?
        Math.min(6, Math.max(3, Math.ceil(files.length / 8))) : // Reduced for large batches
        Math.min(10, Math.max(4, Math.ceil(files.length / 5))); // Keep existing for small batches

    const allFileProcessingResults: Array<ExtractedFileItem> = [];


    // Add memory pressure detection
    const initialMemory = process.memoryUsage();

    // For very large batches (100+ files), add periodic memory cleanup
    const isVeryLargeBatch = files.length >= 100;

    const batchErrors: BatchErrorDetail[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
        const fileChunk = files.slice(i, i + CONCURRENCY_LIMIT);
        // Validate files early to avoid unnecessary processing
        const validatedChunk = fileChunk.map((file) => ({ file, validation: validateUploadFile(file) }));
        const invalids = validatedChunk.filter(v => !v.validation.valid);
        if (invalids.length > 0) {
            for (const inv of invalids) {
                allFileProcessingResults.push({ file: inv.file, extractedData: null, error: inv.validation.error || 'Invalid file', fileName: inv.file.name });
            }
        }
        const validFiles = validatedChunk.filter(v => v.validation.valid).map(v => v.file);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(files.length / CONCURRENCY_LIMIT);


        // Update batch progress
        const currentFileIndex = i + 1;
        const estimatedTimePerFile = 30; // seconds
        const remainingFiles = files.length - currentFileIndex;
        const estimatedCompletion = new Date(Date.now() + (remainingFiles * estimatedTimePerFile * 1000));

        await updateBatchProgress(batchId, {
            processedFiles: i,
            currentFile: fileChunk.length > 0 ? fileChunk[0].name : undefined,
            estimatedCompletion,
        });

        // Memory pressure check
        const currentMemory = process.memoryUsage();
        const heapUsedMB = Math.round(currentMemory.heapUsed / 1024 / 1024);
        const memoryGrowthMB = Math.round((currentMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024);

        if (heapUsedMB > 800 || memoryGrowthMB > 400) { // Conservative thresholds
            console.warn(`[Memory] High memory usage detected: ${heapUsedMB}MB heap (+${memoryGrowthMB}MB growth). Reducing concurrency.`);
            CONCURRENCY_LIMIT = Math.max(2, Math.floor(CONCURRENCY_LIMIT * 0.6));

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
        }

        // For very large batches, run periodic cleanup every 50 files
        if (isVeryLargeBatch && (i / CONCURRENCY_LIMIT) % 10 === 0 && i > 0) {
            if (global.gc) {
                global.gc();
            }
            // Small pause to allow memory cleanup
            await new Promise(resolve => setTimeout(resolve, 2000));
        }


        const chunkExtractionPromises = validFiles.map(async (file): Promise<ExtractedFileItem> => {
            // Basic guards already applied by validateUploadFile

            try {
                // Use the retry wrapper function
                const { extractedData, error: extractionError } = await callPdfExtractAPIWithRetry(file, batchErrors, 3);

                if (extractionError) {
                    return { file, extractedData, error: extractionError, fileName: file.name };
                }

                if (!extractedData) {
                    console.error(`[Batch ${batchNumber}] Failed to extract any usable invoice data for file: ${file.name}.`);
                    return { file, extractedData: null, error: "Failed to extract usable invoice data from PDF.", fileName: file.name };
                }
                if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                    console.warn(`[Batch ${batchNumber}] Missing crucial invoice-level data for file: ${file.name}. Data: ${JSON.stringify(extractedData)}`);
                    return {
                        file,
                        extractedData: extractedData,
                        error: "Missing or invalid crucial invoice-level data after PDF extraction.",
                        fileName: file.name
                    };
                }
                if (!extractedData.items || extractedData.items.length === 0) {
                    console.warn(`[Batch ${batchNumber}] No line items extracted for file: ${file.name}. Proceeding with invoice-level data if valid.`);
                }

                try {
                    new Date(extractedData.issueDate);
                    return {
                        file,
                        extractedData: extractedData,
                        fileName: file.name
                    };
                } catch (dateError) {
                    console.warn(`[Batch ${batchNumber}] Invalid issue date format for file: ${file.name}. Date: ${extractedData.issueDate}`);
                    return {
                        file,
                        extractedData: extractedData,
                        error: `Invalid issue date format: ${extractedData.issueDate}.`,
                        fileName: file.name
                    };
                }
            } catch (topLevelError: unknown) {
                console.error(`[Batch ${batchNumber}] Unexpected error during file processing for ${file.name}:`, topLevelError);
                const errorMessage = topLevelError instanceof Error ? topLevelError.message : "Unknown error during file item processing.";
                return { file, extractedData: null, error: errorMessage, fileName: file.name };
            }
        });

        const chunkResults = await Promise.all(chunkExtractionPromises);
        allFileProcessingResults.push(...chunkResults);

    }

    const extractionResults: ExtractedFileItem[] = allFileProcessingResults.map(item => ({
        file: item.file,
        extractedData: item.extractedData,
        error: item.error,
        fileName: item.fileName,
    }));

    // 2. Separate items with extraction errors from processable items
    const finalResults: CreateInvoiceResult[] = [];
    const processableItems: ExtractedFileItem[] = [];

    for (const item of extractionResults) {
        if (item.error) {
            pushBatchError(batchErrors, {
                kind: 'EXTRACTION_ERROR',
                message: item.error,
                fileName: item.fileName,
                invoiceCode: item.extractedData?.invoiceCode,
            });
            finalResults.push({
                success: false,
                message: item.error,
                fileName: item.fileName
            });
        } else if (item.extractedData) {
            processableItems.push(item);
        }
    }

    // 3. Sort processable items by issueDate (ascending)
    processableItems.sort((a, b) => {
        const dateA = a.extractedData?.issueDate ? new Date(a.extractedData.issueDate).getTime() : 0;
        const dateB = b.extractedData?.issueDate ? new Date(b.extractedData.issueDate).getTime() : 0;
        if (dateA === 0 || dateB === 0) return 0;
        return dateA - dateB;
    });



    // 4. Pre-process providers to reduce race conditions and improve performance
    const uniqueProviders = new Map<string, ExtractedPdfData['provider']>();

    for (const item of processableItems) {
        if (item.extractedData?.provider?.cif) {
            const key = item.extractedData.provider.cif;
            if (!uniqueProviders.has(key)) {
                uniqueProviders.set(key, item.extractedData.provider);
            }
        }
    }

    // Pre-create/find providers to avoid race conditions during invoice processing
    const providerCache = new Map<string, string>(); // CIF -> Provider ID
    for (const [cif, providerData] of uniqueProviders.entries()) {
        try {
            const provider = await prisma.$transaction(async (tx) => {
                return await findOrCreateProviderTx(tx, providerData, user.id);
            });
            providerCache.set(cif, provider.id);
        } catch (error) {
            console.error(`Failed to pre-process provider ${providerData.name} (${cif}):`, error);
            // Continue with other providers, individual invoice processing will handle this error
        }
    }

    // Pre-load a focused set of materials to reduce queries during processing
    console.log("Pre-loading existing materials for faster lookup...");
    const referencedCodes = new Set<string>();
    for (const item of processableItems) {
        const items = item.extractedData?.items ?? [];
        for (const it of items) {
            if (it.materialCode && it.materialCode !== 'null') {
                referencedCodes.add(normalizeMaterialCode(it.materialCode));
            }
        }
    }

    // Try to fetch by referenced codes first, then fall back to a recent slice
    let existingMaterials = await prisma.material.findMany({
        select: { id: true, name: true, code: true, referenceCode: true, category: true },
        where: {
            userId: user.id,
            OR: referencedCodes.size > 0 ? [
                { code: { in: Array.from(referencedCodes) } },
                { referenceCode: { in: Array.from(referencedCodes) } },
            ] : undefined,
        },
        take: referencedCodes.size > 0 ? undefined : 300,
        orderBy: referencedCodes.size > 0 ? undefined : { updatedAt: 'desc' },
    });

    if (existingMaterials.length === 0) {
        existingMaterials = await prisma.material.findMany({
            select: { id: true, name: true, code: true, referenceCode: true, category: true },
            where: { userId: user.id },
            take: 300,
            orderBy: { updatedAt: 'desc' },
        });
    }

    const materialCache = new Map<string, { id: string; name: string; code: string; referenceCode: string | null; category: string | null }>();

    // Cache by name (normalized)
    for (const material of existingMaterials) {
        const normalizedName = material.name.toLowerCase().trim();
        materialCache.set(`name:${normalizedName}`, material);

        // Cache by code if available
        if (material.code) {
            materialCache.set(`code:${material.code}`, material);
        }

        // Cache by reference code if available
        if (material.referenceCode) {
            materialCache.set(`ref:${material.referenceCode}`, material);
        }
    }


    // 5. Process database operations strictly sequentially to preserve chronological order
    const DB_CONCURRENCY_LIMIT = 1; // Enforce chronological processing by date
    const dbResults: CreateInvoiceResult[] = [];

    // Circuit breaker for catastrophic failures
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;
    let circuitBreakerTripped = false;

    for (let i = 0; i < processableItems.length; i += DB_CONCURRENCY_LIMIT) {
        const chunk = processableItems.slice(i, i + DB_CONCURRENCY_LIMIT);

        const chunkPromises = chunk.map(async (item): Promise<CreateInvoiceResult> => {
            const { file, extractedData, fileName } = item;
            if (!extractedData) {
                return { success: false, message: "No extracted data", fileName: fileName };
            }

            // Update batch progress
            await updateBatchProgress(batchId, {
                currentFile: fileName,
            });

            // Retry mechanism for handling provider race conditions during concurrent processing
            const maxRetries = 3;
            let lastError: unknown = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {

                    // For large invoices, use longer timeout and optimized processing
                    const itemCount = extractedData.items?.length || 0;
                    const isLargeInvoice = itemCount > 50;
                    const isVeryLargeInvoice = itemCount > 200;

                    // Adaptive timeout based on item count
                    const baseTimeout = isVeryLargeInvoice ? 1800000 : isLargeInvoice ? 900000 : 300000; // 30min/15min/5min
                    const transactionTimeout = Math.min(baseTimeout, 1800000); // Cap at 30 minutes

                    if (isLargeInvoice) {
                    }

                    const operationResult: TransactionOperationResult = await prisma.$transaction(async (tx) => {
                        // Use cached provider if available, otherwise fall back to findOrCreateProviderTx
                        let provider;
                        const cachedProviderId = extractedData.provider.cif ? providerCache.get(extractedData.provider.cif) : undefined;

                        if (cachedProviderId) {
                            provider = await tx.provider.findUnique({
                                where: { id: cachedProviderId }
                            });

                            // Either the provider disappeared (unlikely) or it belongs to
                            // another user. Fallback to a scoped lookup.
                            if (!provider || provider.userId !== user.id) {
                                provider = await findOrCreateProviderTx(tx, extractedData.provider, user.id);
                            }
                        } else {
                            provider = await findOrCreateProviderTx(tx, extractedData.provider, user.id);
                        }

                        const existingInvoice = await tx.invoice.findFirst({
                            where: {
                                invoiceCode: extractedData.invoiceCode,
                                providerId: provider.id
                            }
                        });

                        if (existingInvoice) {
                            pushBatchError(batchErrors, {
                                kind: 'DUPLICATE_INVOICE',
                                message: `${fileName}: La factura ${extractedData.invoiceCode} ya existe para el proveedor ${provider.name}. Esta factura ya fue procesada anteriormente.`,
                                fileName,
                                invoiceCode: extractedData.invoiceCode,
                            });
                            return {
                                success: true,
                                message: `La factura ${extractedData.invoiceCode} del proveedor ${provider.name} ya existe.`,
                                invoiceId: existingInvoice.id,
                                alertsCreated: 0,
                                isExisting: true
                            };
                        }

                        const invoice = await tx.invoice.create({
                            data: {
                                invoiceCode: extractedData.invoiceCode,
                                providerId: provider.id,
                                issueDate: new Date(extractedData.issueDate),
                                totalAmount: new Prisma.Decimal(extractedData.totalAmount.toFixed(2)),
                                status: "PROCESSED",
                            },
                        });

                        let alertsCounter = 0;
                        const currentInvoiceIssueDate = new Date(extractedData.issueDate);
                        const intraInvoiceMaterialPriceHistory = new Map<string, { price: Prisma.Decimal; date: Date; invoiceItemId: string }>();

                        // Process items in optimized chunks for performance
                        const ITEM_CHUNK_SIZE = isVeryLargeInvoice ? 15 : isLargeInvoice ? 30 : 999; // Smaller chunks for very large invoices
                        const itemChunks = [];
                        for (let i = 0; i < extractedData.items.length; i += ITEM_CHUNK_SIZE) {
                            itemChunks.push(extractedData.items.slice(i, i + ITEM_CHUNK_SIZE));
                        }

                        console.log(`[Invoice ${invoice.invoiceCode}] Processing ${extractedData.items.length} items in ${itemChunks.length} chunk(s) (chunk size: ${ITEM_CHUNK_SIZE})`);

                        for (let chunkIndex = 0; chunkIndex < itemChunks.length; chunkIndex++) {
                            const itemChunk = itemChunks[chunkIndex];

                            if (isLargeInvoice && chunkIndex > 0) {
                                // Minimal delay between chunks for very large invoices
                                await new Promise(resolve => setTimeout(resolve, isVeryLargeInvoice ? 50 : 100));
                            }

                            for (const itemData of itemChunk) {
                                if (!itemData.materialName) {
                                    console.warn(`Skipping item due to missing material name in invoice ${invoice.invoiceCode} from file ${fileName}`);
                                    continue;
                                }

                                if (typeof itemData.quantity !== 'number' || isNaN(itemData.quantity)) {
                                    console.warn(`Skipping item due to invalid or missing quantity in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}, Quantity: ${itemData.quantity}`);
                                    continue;
                                }

                                if (typeof itemData.unitPrice !== 'number' || isNaN(itemData.unitPrice)) {
                                    console.warn(`Missing or invalid unit price for item in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}. Defaulting to 0.`);
                                    itemData.unitPrice = 0;
                                }
                                if (typeof itemData.totalPrice !== 'number' || isNaN(itemData.totalPrice)) {
                                    console.warn(`Missing or invalid total price for item in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}. Defaulting to 0.`);
                                    itemData.totalPrice = 0;
                                }

                                const isMaterialItem = typeof itemData.isMaterial === 'boolean' ? itemData.isMaterial : true;

                                if (!isMaterialItem) {
                                    const quantityDecimal = new Prisma.Decimal(itemData.quantity.toFixed(2));
                                    const currentUnitPriceDecimal = new Prisma.Decimal(itemData.unitPrice.toFixed(2));
                                    const totalPriceDecimal = new Prisma.Decimal(itemData.totalPrice.toFixed(2));
                                    const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;

                                    await tx.invoiceItem.create({
                                        data: {
                                            invoiceId: invoice.id,
                                            materialId: (await findOrCreateMaterialTxWithCache(tx, itemData.materialName, itemData.materialCode, provider.type, materialCache, user.id)).id,
                                            quantity: quantityDecimal,
                                            unitPrice: currentUnitPriceDecimal,
                                            totalPrice: totalPriceDecimal,
                                            itemDate: effectiveItemDate,
                                            workOrder: itemData.workOrder || null,
                                        },
                                    });
                                    continue;
                                }

                                let material: Material;
                                try {
                                    material = await findOrCreateMaterialTxWithCache(tx, itemData.materialName, itemData.materialCode, provider.type, materialCache, user.id);
                                } catch (materialError) {
                                    console.error(`Error creating/finding material '${itemData.materialName}' in invoice ${invoice.invoiceCode}:`, materialError);
                                    throw new Error(`Failed to process material '${itemData.materialName}': ${materialError instanceof Error ? materialError.message : 'Unknown error'}`);
                                }
                                const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;
                                const currentItemUnitPrice = new Prisma.Decimal(itemData.unitPrice.toFixed(2));

                                const lastSeenPriceRecordInThisInvoice = intraInvoiceMaterialPriceHistory.get(material.id);

                                if (lastSeenPriceRecordInThisInvoice) {
                                    if (effectiveItemDate.getTime() >= lastSeenPriceRecordInThisInvoice.date.getTime() &&
                                        !currentItemUnitPrice.equals(lastSeenPriceRecordInThisInvoice.price)) {

                                        const priceDiff = currentItemUnitPrice.minus(lastSeenPriceRecordInThisInvoice.price);
                                        let percentageChangeDecimal: Prisma.Decimal;
                                        if (!lastSeenPriceRecordInThisInvoice.price.isZero()) {
                                            percentageChangeDecimal = priceDiff.dividedBy(lastSeenPriceRecordInThisInvoice.price).times(100);
                                        } else {
                                            percentageChangeDecimal = new Prisma.Decimal(currentItemUnitPrice.isPositive() ? 9999 : -9999);
                                        }

                                        try {
                                            await tx.priceAlert.create({
                                                data: {
                                                    materialId: material.id,
                                                    providerId: provider.id,
                                                    oldPrice: lastSeenPriceRecordInThisInvoice.price,
                                                    newPrice: currentItemUnitPrice,
                                                    percentage: percentageChangeDecimal,
                                                    status: "PENDING",
                                                    effectiveDate: effectiveItemDate,
                                                    invoiceId: invoice.id,
                                                },
                                            });
                                            alertsCounter++;
                                        } catch (alertError) {
                                            // Manejar error de constraint único para alertas intra-factura
                                            if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                                                (alertError as { code: string }).code === 'P2002') {
                                            } else {
                                                throw alertError;
                                            }
                                        }
                                    }
                                }

                                const { invoiceItem, alert: interInvoiceAlert } = await processInvoiceItemTx(
                                    tx,
                                    itemData,
                                    invoice.id,
                                    currentInvoiceIssueDate,
                                    provider.id,
                                    material,
                                    isMaterialItem
                                );

                                if (interInvoiceAlert) {
                                    alertsCounter++;
                                }

                                if (isMaterialItem) {
                                    intraInvoiceMaterialPriceHistory.set(material.id, {
                                        price: invoiceItem.unitPrice,
                                        date: invoiceItem.itemDate,
                                        invoiceItemId: invoiceItem.id
                                    });
                                }
                            }
                        }
                        return {
                            success: true,
                            message: `Invoice ${invoice.invoiceCode} created successfully.`,
                            invoiceId: invoice.id,
                            alertsCreated: alertsCounter,
                            isExisting: false
                        };
                    }, {
                        timeout: transactionTimeout, // Use dynamic timeout based on invoice size
                        maxWait: 300000 // 5 minutes max wait
                    });

                    // Success! Return the result
                    if (operationResult.isExisting) {
                        return {
                            success: true,
                            message: operationResult.message,
                            invoiceId: operationResult.invoiceId,
                            fileName: fileName
                        };
                    } else {
                        return {
                            success: operationResult.success,
                            message: operationResult.message,
                            invoiceId: operationResult.invoiceId,
                            alertsCreated: operationResult.alertsCreated,
                            fileName: fileName
                        };
                    }

                } catch (error) {
                    lastError = error;
                    console.error(`Error processing sorted invoice from ${fileName} (attempt ${attempt}/${maxRetries}):`, error);

                    // Check for memory-related errors
                    const isMemoryError = error instanceof Error && (
                        error.message.includes('out of memory') ||
                        error.message.includes('ENOMEM') ||
                        error.message.includes('heap') ||
                        error.message.includes('JavaScript heap out of memory')
                    );

                    // Check for timeout errors
                    const isTimeoutError = error instanceof Error && (
                        error.message.includes('timeout') ||
                        error.message.includes('ETIMEDOUT') ||
                        error.message.includes('Connection timeout')
                    );

                    // Check for database connection errors
                    const isConnectionError = typeof error === 'object' && error !== null && 'code' in error &&
                        ['P1000', 'P1001', 'P1002', 'P1008', 'P1009', 'P1010'].includes((error as { code: string }).code);

                    // Check if this error is worth retrying
                    const isRetryableError = typeof error === 'object' && error !== null && 'code' in error &&
                        (error as { code: string }).code === 'P2002'; // Unique constraint violation

                    const isBlockedProviderError = error instanceof Error &&
                        (error as Error & { isBlockedProvider?: boolean }).isBlockedProvider;

                    // Special handling for memory errors
                    if (isMemoryError) {
                        console.error(`[Memory Error] Memory exhaustion detected for ${fileName}. This file will be skipped.`);
                        if (global.gc) {
                            global.gc();
                        }
                        break; // Don't retry memory errors
                    }

                    // Special handling for timeout errors - retry with longer timeout
                    if (isTimeoutError && attempt < maxRetries) {
                        console.warn(`[Timeout] Transaction timeout for ${fileName}, will retry with longer timeout...`);
                        const delay = attempt * 2000 + Math.random() * 1000; // 2-3s, 4-5s delays
                        console.log(`Will retry after ${delay.toFixed(0)}ms delay...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // Special handling for connection errors - longer retry delays
                    if (isConnectionError && attempt < maxRetries) {
                        console.warn(`[Connection] Database connection error for ${fileName}, will retry...`);
                        const delay = attempt * 5000 + Math.random() * 2000; // 5-7s, 10-12s delays
                        console.log(`Will retry after ${delay.toFixed(0)}ms delay...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // Don't retry for blocked providers, memory errors, or on last attempt
                    if (isBlockedProviderError || isMemoryError || attempt === maxRetries || (!isRetryableError && !isTimeoutError && !isConnectionError)) {
                        break; // Exit retry loop
                    }

                    // Add a small delay before retrying to reduce race conditions
                    const delay = attempt * 100 + Math.random() * 100; // 100-200ms, 200-300ms, etc.
                    console.log(`Will retry after ${delay.toFixed(0)}ms delay...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // If we get here, all retries failed
            const baseMessage = `Failed to create invoice from ${fileName}`;
            let specificMessage = "An unexpected error occurred.";
            let isBlockedProvider = false;

            if (lastError instanceof Error) {
                specificMessage = lastError.message;

                // Check if this is a blocked provider error
                if ((lastError as Error & { isBlockedProvider?: boolean }).isBlockedProvider) {
                    isBlockedProvider = true;
                    specificMessage = `Provider is blocked: ${specificMessage}`;
                    console.warn(`Blocked provider detected in file ${fileName}: ${specificMessage}`);
                } else if (specificMessage.includes('Failed to process material')) {
                    specificMessage = `Material processing error: ${specificMessage}`;
                } else if (specificMessage.includes('after 10 attempts due to code conflicts')) {
                    specificMessage = `Unable to create unique material code. This may indicate a data consistency issue.`;
                } else if (specificMessage.includes('Provider') && specificMessage.includes('is blocked')) {
                    isBlockedProvider = true;
                    specificMessage = `This provider is not allowed for processing.`;
                }
            }

            const isPrismaP2002Error = (e: unknown): e is { code: string; meta?: { target?: string[] } } => {
                return typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';
            };

            if (isPrismaP2002Error(lastError)) {
                if (lastError.meta && lastError.meta.target) {
                    if (lastError.meta.target.includes('invoiceCode') && extractedData) {
                        console.warn(`Duplicate invoice code '${extractedData.invoiceCode}' for file: ${fileName} (after ${maxRetries} retries)`);
                        specificMessage = `An invoice with code '${extractedData.invoiceCode}' already exists.`;
                    } else if (lastError.meta.target.includes('code')) {
                        specificMessage = `A material with this code already exists. Race condition persisted after ${maxRetries} retries.`;
                    } else if (lastError.meta.target.includes('cif')) {
                        specificMessage = `Provider CIF constraint conflict persisted after ${maxRetries} retries. This may indicate a provider consolidation issue.`;
                    }
                }
            }

            return {
                success: false,
                message: isBlockedProvider ? specificMessage : `${baseMessage}: ${specificMessage}`,
                fileName: fileName,
                isBlockedProvider
            };
        });

        const chunkResults = await Promise.all(chunkPromises);
        dbResults.push(...chunkResults);

        // Update circuit breaker state
        const failuresInChunk = chunkResults.filter(r => !r.success && !r.isBlockedProvider).length;
        if (failuresInChunk > 0) {
            consecutiveFailures += failuresInChunk;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                circuitBreakerTripped = true;
                console.error(`[Circuit Breaker] ${consecutiveFailures} consecutive failures detected. Stopping further processing to prevent system overload.`);

                // Mark remaining items as failed
                const remainingItems = processableItems.slice(i + DB_CONCURRENCY_LIMIT);
                for (const item of remainingItems) {
                    dbResults.push({
                        success: false,
                        message: `Processing stopped due to circuit breaker (${consecutiveFailures} consecutive failures)`,
                        fileName: item.fileName
                    });
                }
                break;
            }
        } else {
            // Reset counter on successful batch
            consecutiveFailures = 0;
        }
    }

    // Combine extraction errors with database results
    finalResults.push(...dbResults);

    // Add batch ID to all results
    const finalResultsWithBatch = finalResults.map(result => ({
        ...result,
        batchId
    }));

    // Calculate final batch statistics
    const successfulInvoices = finalResultsWithBatch.filter(r => r.success && !r.message.includes("already exists"));
    const duplicateInvoices = finalResultsWithBatch.filter(r => r.success && r.message.includes("already exists"));
    const failedInvoices = finalResultsWithBatch.filter(r => !r.success && !r.isBlockedProvider);
    const blockedInvoices = finalResultsWithBatch.filter(r => r.isBlockedProvider);

    // Update final batch status
    const overallSuccess = finalResultsWithBatch.every(r => r.success);
    const finalStatus: BatchStatus = circuitBreakerTripped ? 'FAILED' :
        overallSuccess ? 'COMPLETED' : 'COMPLETED'; // Still completed even with some failures

    // For statistical purposes, treat duplicates as separate category but ensure errors are saved
    // Duplicates are "successful" (no error occurred) but still need to be tracked
    const totalFailedOrDuplicate = failedInvoices.length + duplicateInvoices.length;

    await updateBatchProgress(batchId, {
        status: finalStatus,
        processedFiles: files.length,
        successfulFiles: successfulInvoices.length,
        failedFiles: totalFailedOrDuplicate,
        blockedFiles: blockedInvoices.length,
        completedAt: new Date(),
        errors: batchErrors.length > 0 ? batchErrors : undefined,
    });

    // Performance summary
    const batchRecord = await prisma.batchProcessing.findUnique({
        where: { id: batchId },
        select: { createdAt: true }
    });
    const processingTimeMs = batchRecord ? Date.now() - batchRecord.createdAt.getTime() : null;

    const avgTimePerFile = processingTimeMs ? (processingTimeMs / files.length / 1000).toFixed(2) : 'N/A';
    const totalAlerts = finalResultsWithBatch.reduce((sum, r) => sum + (r.alertsCreated || 0), 0);


    const newlyCreatedInvoices = finalResultsWithBatch.filter(r => r.success && r.invoiceId && !r.message.includes("already exists"));

    if (newlyCreatedInvoices.length > 0) {
        revalidatePath("/facturas");
        if (newlyCreatedInvoices.some(r => r.alertsCreated && r.alertsCreated > 0)) {
            revalidatePath("/alertas");
        }
    }

    // Clean up old batch records as maintenance (non-blocking)
    if (Math.random() < 0.1) { // Only run cleanup 10% of the time to reduce overhead
        cleanupOldBatches().catch(error => {
            console.error("Background cleanup failed:", error);
        });
    }

    return { overallSuccess, results: finalResultsWithBatch, batchId };
}

// Manual invoice creation function for form submissions
export interface ManualInvoiceData {
    provider: {
        name: string;
        cif: string | null;
        email: string | null;
        phone: string | null;
    };
    invoiceCode: string;
    issueDate: string;
    items: Array<{
        materialName: string;
        materialCode?: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        description: string | null;
        workOrder: string | null;
        isMaterial: boolean;
    }>;
    totalAmount: number;
}

export async function createManualInvoice(data: ManualInvoiceData): Promise<CreateInvoiceResult> {
    const user = await requireAuth()

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Validate provider data
            if (!data.provider.cif) {
                throw new Error(`Provider '${data.provider.name}' must have a CIF for manual invoice creation.`);
            }

            // 2. Find or create provider
            const provider = await findOrCreateProviderTx(tx, {
                name: data.provider.name,
                cif: data.provider.cif,
                email: data.provider.email || undefined,
                phone: data.provider.phone || undefined,
            }, user.id);

            // 3. Check if invoice already exists
            const existingInvoice = await tx.invoice.findFirst({
                where: {
                    invoiceCode: data.invoiceCode,
                    providerId: provider.id,
                },
            });

            if (existingInvoice) {
                return {
                    success: false,
                    message: `Invoice with code '${data.invoiceCode}' already exists for this provider.`,
                };
            }

            // 4. Create invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceCode: data.invoiceCode,
                    providerId: provider.id,
                    issueDate: new Date(data.issueDate),
                    totalAmount: new Prisma.Decimal(data.totalAmount.toFixed(2)),
                    status: "PROCESSED",
                },
            });

            let alertsCounter = 0;
            const currentInvoiceIssueDate = new Date(data.issueDate);

            // 5. Process each item
            for (const itemData of data.items) {
                if (!itemData.materialName) {
                    console.warn(`Skipping item due to missing material name in manual invoice ${invoice.invoiceCode}`);
                    continue;
                }

                // Find or create material
                const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialCode, provider.type, user.id);

                // Create invoice item
                const invoiceItem = await tx.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        materialId: material.id,
                        quantity: new Prisma.Decimal(itemData.quantity.toFixed(2)),
                        unitPrice: new Prisma.Decimal(itemData.unitPrice.toFixed(2)),
                        totalPrice: new Prisma.Decimal(itemData.totalPrice.toFixed(2)),
                        itemDate: currentInvoiceIssueDate,
                        description: itemData.description,
                        workOrder: itemData.workOrder,
                    },
                });

                // Only create price alerts for material items
                if (itemData.isMaterial) {
                    // Check for price changes (only inter-invoice for manual entries)
                    const lastPurchase = await tx.invoiceItem.findFirst({
                        where: {
                            materialId: material.id,
                            invoice: {
                                providerId: provider.id,
                                issueDate: {
                                    lt: currentInvoiceIssueDate,
                                },
                            },
                        },
                        orderBy: {
                            itemDate: 'desc',
                        },
                    });

                    if (lastPurchase) {
                        const currentPrice = new Prisma.Decimal(itemData.unitPrice.toFixed(2));
                        const lastPrice = lastPurchase.unitPrice;

                        if (!currentPrice.equals(lastPrice)) {
                            const priceDiff = currentPrice.minus(lastPrice);
                            let percentageChange: Prisma.Decimal;

                            if (!lastPrice.isZero()) {
                                percentageChange = priceDiff.dividedBy(lastPrice).times(100);
                            } else {
                                percentageChange = new Prisma.Decimal(currentPrice.isPositive() ? 9999 : -9999);
                            }

                            // Only create alert if change is significant (>5%)
                            if (percentageChange.abs().gte(5)) {
                                try {
                                    await tx.priceAlert.create({
                                        data: {
                                            materialId: material.id,
                                            providerId: provider.id,
                                            oldPrice: lastPrice,
                                            newPrice: currentPrice,
                                            percentage: percentageChange,
                                            status: "PENDING",
                                            effectiveDate: currentInvoiceIssueDate,
                                            invoiceId: invoice.id,
                                        },
                                    });
                                    alertsCounter++;
                                } catch (alertError) {
                                    // Manejar error de constraint único en facturas manuales
                                    if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                                        (alertError as { code: string }).code === 'P2002') {
                                    } else {
                                        throw alertError;
                                    }
                                }
                            }
                        }
                    }

                    // Update or create MaterialProvider relationship
                    await tx.materialProvider.upsert({
                        where: {
                            materialId_providerId: {
                                materialId: material.id,
                                providerId: provider.id,
                            },
                        },
                        update: {
                            lastPriceDate: currentInvoiceIssueDate,
                            lastPrice: new Prisma.Decimal(itemData.unitPrice.toFixed(2)),
                        },
                        create: {
                            materialId: material.id,
                            providerId: provider.id,
                            lastPriceDate: currentInvoiceIssueDate,
                            lastPrice: new Prisma.Decimal(itemData.unitPrice.toFixed(2)),
                        },
                    });
                }
            }

            return {
                success: true,
                message: `Manual invoice ${invoice.invoiceCode} created successfully.`,
                invoiceId: invoice.id,
                alertsCreated: alertsCounter,
            };
        });

        // Revalidate paths if successful
        if (result.success) {
            revalidatePath("/facturas");
            if (result.alertsCreated && result.alertsCreated > 0) {
                revalidatePath("/alertas");
            }
        }

        return result;
    } catch (error) {
        console.error("Error creating manual invoice:", error);

        let errorMessage = "An unexpected error occurred.";
        let isBlockedProvider = false;

        if (error instanceof Error) {
            errorMessage = error.message;

            // Check if this is a blocked provider error
            if ((error as Error & { isBlockedProvider?: boolean }).isBlockedProvider) {
                isBlockedProvider = true;
            }
        }

        // Handle specific Prisma errors
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const prismaError = error as { code: string; meta?: { target?: string[] } };
            if (prismaError.code === 'P2002' && prismaError.meta?.target?.includes('invoiceCode')) {
                errorMessage = `An invoice with code '${data.invoiceCode}' already exists.`;
            }
        }

        return {
            success: false,
            message: errorMessage,
            isBlockedProvider,
        };
    }
}

// ---------------------------------------------------------------------------
// 🏗️  Helper: Build a real JSONL line for the Batch API for one PDF file.
// ---------------------------------------------------------------------------

async function prepareBatchLine(file: File): Promise<string> {
    // Validate file before heavy processing
    const validation = validateUploadFile(file);
    if (!validation.valid) {
        throw new Error(validation.error || 'Invalid file');
    }
    // 1️⃣  Read original file and compute base64 to send as inlineData to Gemini
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    // 2️⃣  Build prompt for direct PDF processing with text-based output
    const promptText = buildExtractionPrompt();

    // Build Gemini JSONL request line
    const jsonlObject = {
        key: file.name,
        request: {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: 'application/pdf', data: base64 } }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 65536,
                candidateCount: 1
            }
        }
    };

    return JSON.stringify(jsonlObject);
}

// Convenience: generate all lines in parallel with limited concurrency (4)
async function buildBatchJsonl(files: File[]): Promise<string> {
    const CONCURRENCY = 4;
    const lines: string[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        const chunk = files.slice(i, i + CONCURRENCY);
        const validChunk = chunk.filter(f => validateUploadFile(f).valid);
        const chunkLines = await Promise.all(validChunk.map(prepareBatchLine));
        lines.push(...chunkLines);
    }
    return lines.join("\n");
}

// Convenience: generate JSONL chunks whose size stays safely under the 100 MB limit imposed by the Batch API
// Stay well below that hard limit so we never lose the entire
// batch due to a single oversize upload.
const MAX_BATCH_FILE_SIZE = 90 * 1024 * 1024; // 90 MB safety threshold

interface JsonlChunk {
    content: string;
    files: File[];
}

async function buildBatchJsonlChunks(files: File[]): Promise<JsonlChunk[]> {
    const chunks: JsonlChunk[] = [];

    // Allow limited parallelism to accelerate heavy pdfToPng work.
    // Use more conservative concurrency for very large batches to avoid OOM.
    const CONCURRENCY = files.length >= 250 ? 1 : files.length >= 150 ? 2 : 4;

    console.log(`[buildBatchJsonlChunks] Building JSONL for ${files.length} files with concurrency ${CONCURRENCY}`);

    let currentLines: string[] = [];
    let currentSize = 0;
    let currentFiles: File[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        // Slice the next group of files and process them in parallel.
        const slice = files.slice(i, i + CONCURRENCY).filter(f => validateUploadFile(f).valid);

        const results = await Promise.all(
            slice.map(async (file) => {
                const line = await prepareBatchLine(file);
                return { file, line } as const;
            })
        );

        // Append each prepared line, starting new chunks when size would exceed the cap.
        for (const { file, line } of results) {
            const lineSize = Buffer.byteLength(line, "utf8") + 1; // +1 for newline

            if (currentSize + lineSize > MAX_BATCH_FILE_SIZE && currentLines.length > 0) {
                chunks.push({ content: currentLines.join("\n"), files: currentFiles });
                currentLines = [];
                currentFiles = [];
                currentSize = 0;
            }

            currentLines.push(line);
            currentFiles.push(file);
            currentSize += lineSize;
        }

        // Memory monitoring & opportunistic GC
        const mem = process.memoryUsage();
        const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
        if (heapMb > 1500) {
            console.warn(`[buildBatchJsonlChunks] High heap usage detected (${heapMb} MB). Triggering GC and throttling…`);
            if (global.gc) {
                global.gc();
            }
            // Small delay to let GC do its work in tight loops
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    if (currentLines.length > 0) {
        chunks.push({ content: currentLines.join("\n"), files: currentFiles });
    }

    return chunks;
}

// ---------------------------------------------------------------------------
// 🏗️  Helper: Persist extracted JSON response (used by webhook)
// ---------------------------------------------------------------------------

export async function saveExtractedInvoice(extractedData: ExtractedPdfData, fileName?: string): Promise<CreateInvoiceResult> {
    const user = await requireAuth()

    try {
        const result = await prisma.$transaction(async (tx) => {
            // ✅ Provider
            const provider = await findOrCreateProviderTx(tx, extractedData.provider, user.id);

            // ❌  Duplicate check
            const existingInvoice = await tx.invoice.findFirst({
                where: { invoiceCode: extractedData.invoiceCode, providerId: provider.id },
            });
            if (existingInvoice) {
                console.warn(`[saveExtractedInvoice] Invoice ${extractedData.invoiceCode} already exists for provider ${provider.name} (file: ${fileName ?? "unknown"})`);
                return {
                    success: false,
                    message: `${fileName ?? 'Archivo desconocido'}: La factura ${extractedData.invoiceCode} ya existe para el proveedor ${provider.name}. Esta factura ya fue procesada anteriormente.`,
                    invoiceId: existingInvoice.id,
                };
            }

            // ✅ Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceCode: extractedData.invoiceCode,
                    providerId: provider.id,
                    issueDate: new Date(extractedData.issueDate),
                    totalAmount: new Prisma.Decimal(extractedData.totalAmount.toFixed(2)),
                    status: "PROCESSED",
                },
            });

            let alertsCreated = 0;
            let itemsProcessed = 0;
            let itemsSkipped = 0;

            for (const item of extractedData.items) {
                // 🚦 Validate item data to prevent runtime errors
                if (!item.materialName) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Skipping line item due to missing material name (file: ${fileName ?? "unknown"}). Item data:`, item);
                    itemsSkipped++;
                    continue;
                }

                if (typeof item.quantity !== "number" || isNaN(item.quantity)) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Skipping item '${item.materialName}' due to invalid quantity: ${item.quantity} (file: ${fileName ?? "unknown"})`);
                    itemsSkipped++;
                    continue; // Quantity is mandatory to create an item
                }

                // Default missing or invalid prices to 0 so the invoice can still be saved
                if (typeof item.unitPrice !== "number" || isNaN(item.unitPrice)) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Invalid or missing unitPrice for '${item.materialName}'. Defaulting to 0 (file: ${fileName ?? "unknown"})`);
                    (item as unknown as { unitPrice: number }).unitPrice = 0;
                }
                if (typeof item.totalPrice !== "number" || isNaN(item.totalPrice)) {
                    console.warn(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Invalid or missing totalPrice for '${item.materialName}'. Defaulting to 0 (file: ${fileName ?? "unknown"})`);
                    (item as unknown as { totalPrice: number }).totalPrice = 0;
                }

                try {
                    const material = await findOrCreateMaterialTx(tx, item.materialName, item.materialCode, provider.type, user.id);
                    await processInvoiceItemTx(
                        tx,
                        item,
                        invoice.id,
                        new Date(extractedData.issueDate),
                        provider.id,
                        material,
                        item.isMaterial ?? true,
                    ).then(({ alert }) => {
                        if (alert) alertsCreated += 1;
                    });
                    itemsProcessed++;
                } catch (itemErr) {
                    console.error(`[saveExtractedInvoice][Invoice ${extractedData.invoiceCode}] Failed to process item '${item.materialName}' (file: ${fileName ?? "unknown"}):`, itemErr);
                    console.error(`[saveExtractedInvoice] Item data:`, item);
                    itemsSkipped++;
                }
            }


            return {
                success: true,
                message: `Invoice ${invoice.invoiceCode} created (${itemsProcessed} items, ${alertsCreated} alerts)`,
                invoiceId: invoice.id,
                alertsCreated,
            };
        });

        return result;
    } catch (err) {
        const error = err as Error;
        console.error(`[saveExtractedInvoice] Failed to persist invoice from batch output (file: ${fileName ?? "unknown"})`, {
            error: error.message,
            stack: error.stack,
            extractedData: extractedData
        });
        return {
            success: false,
            message: `Database error: ${error.message}`,
            fileName
        } as CreateInvoiceResult;
    }
}

// ---------------------------------------------------------------------------
// 🚀  Server Action: kick off Batch job (returns immediately)
// ---------------------------------------------------------------------------

export async function startInvoiceBatch(formDataWithFiles: FormData): Promise<{ batchId: string }> {
    const files = formDataWithFiles.getAll('files') as File[];
    if (!files || files.length === 0) {
        throw new Error('No files provided.');
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
        throw new Error(`Too many files. Maximum allowed is ${MAX_FILES_PER_UPLOAD}.`);
    }
    const totalBytes = files.reduce((sum, f) => sum + (typeof f.size === 'number' ? f.size : 0), 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new Error(`Total upload size exceeds ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }

    // Filter invalid files early
    const validFiles = files.filter(f => validateUploadFile(f).valid);
    if (validFiles.length === 0) {
        throw new Error('No valid files to process. Ensure PDFs under the size limit.');
    }

    // Get authenticated user for batch ownership
    const user = await requireAuth();

    // 1️⃣  Generate a temporary id so the client can detect "batch mode". We do
    //     NOT persist it, thus it will not contribute to banner counts.
    const { randomUUID } = await import('crypto');
    const tempId = `temp-${randomUUID()}`;

    // 2️⃣  Launch heavy work in background (no await).
    void processBatchInBackground(validFiles, user.id).catch((err) => {
        console.error('[startInvoiceBatch] Background batch failed', err);
    });

    // 3️⃣  Return the temporary id immediately.
    return { batchId: tempId };
}

// ---------------------------------------------------------------------------
// 🏃‍♂️  Background worker — performs the heavy work and creates real Batch jobs
// ---------------------------------------------------------------------------

async function processBatchInBackground(files: File[], userId: string) {
    // Create an initial batch record that will be updated as processing happens
    let batchId: string | null = null;

    try {
        // STEP A – Build JSONL chunks
        const tmpDir = path.join(process.env.NODE_ENV === 'development' ? path.join(process.cwd(), 'tmp') : os.tmpdir(), 'facturas-batch');
        try {
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true, mode: 0o755 });
            }
        } catch (mkdirError) {
            const errorMsg = mkdirError instanceof Error ? mkdirError.message : 'Unknown error creating tmp directory';
            console.error('[processBatchInBackground] Failed to create tmp directory:', mkdirError);
            throw new Error(`Failed to create temporary directory: ${errorMsg}`);
        }

        const chunks = await buildBatchJsonlChunks(files);
        if (chunks.length === 0) {
            throw new Error('No JSONL chunks built.');
        }

        let isFirstChunk = true;

        for (const [index, chunk] of chunks.entries()) {
            const jsonlPath = path.join(tmpDir, `gemini-batch-${Date.now()}-${index}.jsonl`);
            await fs.promises.writeFile(jsonlPath, chunk.content, 'utf8');

            // Upload file to Gemini with retry logic
            let uploaded: { name?: string; id?: string } | undefined;
            let uploadAttempts = 0;
            while (uploadAttempts < 3) {
                try {
                    uploaded = await gemini.files.upload({
                        file: jsonlPath,
                        config: { displayName: `invoices-${Date.now()}-${index}`, mimeType: 'application/jsonl' }
                    }) as unknown as { name?: string; id?: string };
                    break;
                } catch (error: unknown) {
                    uploadAttempts++;
                    if (uploadAttempts >= 3) throw error;
                    if (isRateLimitError(error)) {
                        console.log(`[processBatchInBackground] Rate limit hit during file upload, waiting 2s before retry ${uploadAttempts}/3`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        throw error;
                    }
                }
            }

            // Create Gemini batch job with retry logic
            let created: { name: string } | undefined;
            let batchAttempts = 0;
            // Ensure we have a valid file identifier from the upload response
            const fileIdentifier = (uploaded as { name?: string; id?: string } | undefined)?.name;
            if (!fileIdentifier) {
                throw new Error('[processBatchInBackground] Gemini file upload did not return a valid file identifier (name or id)');
            }
            while (batchAttempts < 3) {
                try {
                    created = await gemini.batches.create({
                        model: GEMINI_MODEL,
                        src: fileIdentifier,
                        config: { displayName: `invoice-job-${Date.now()}-${index}` }
                    }) as unknown as { name: string };
                    break;
                } catch (error: unknown) {
                    batchAttempts++;
                    if (batchAttempts >= 3) throw error;
                    if (isRateLimitError(error)) {
                        console.log(`[processBatchInBackground] Rate limit hit during batch creation, waiting 1s before retry ${batchAttempts}/3`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw error;
                    }
                }
            }

            const remoteId: string = created?.name || 'unknown';
            console.log(`[processBatchInBackground] Created Gemini batch ${remoteId} for chunk ${index + 1}/${chunks.length} (${chunk.files.length} files)`);

            // On the first chunk, create the local batch record using the Gemini batch ID
            if (isFirstChunk && remoteId !== 'unknown') {
                batchId = await createBatchProcessing(files.length, remoteId, userId);
                isFirstChunk = false;

                // Update to PROCESSING state
                await updateBatchProgress(batchId, {
                    status: 'PROCESSING',
                    startedAt: new Date(),
                });
            }

            // Cleanup temp file in background (don't block loop)
            fs.promises.unlink(jsonlPath).catch(() => undefined);
        }
    } catch (err) {
        console.error('[processBatchInBackground] Failed to enqueue batches', err);

        // If we created a batch record, update it with the error so the user sees it
        if (batchId) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error during batch processing';
            await updateBatchProgress(batchId, {
                status: 'FAILED',
                errors: [
                    {
                        kind: 'DATABASE_ERROR',
                        message: errorMsg,
                        timestamp: new Date().toISOString(),
                    },
                ],
                completedAt: new Date(),
                failedFiles: files.length,
            }).catch((updateErr) => {
                console.error('[processBatchInBackground] Failed to update batch record with error:', updateErr);
            });
        }
    } finally {
        // Clean up temporary directory after processing
        try {
            const tmpDir = path.join(os.tmpdir(), 'facturas-batch');
            if (fs.existsSync(tmpDir)) {
                const files = await fs.promises.readdir(tmpDir);
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                for (const file of files) {
                    try {
                        const filePath = path.join(tmpDir, file);
                        const stats = await fs.promises.stat(filePath);
                        if (stats.isFile() && stats.mtime.getTime() < oneHourAgo) {
                            await fs.promises.unlink(filePath);
                            console.log(`[processBatchInBackground] Cleaned up old tmp file: ${file}`);
                        }
                    } catch { }
                }
            }
        } catch (cleanupErr) {
            console.warn('[processBatchInBackground] Failed to cleanup tmp directory:', cleanupErr);
        }
    }
}

// ---------------------------------------------------------------------------
// Helper to download and persist results of a completed batch
// ---------------------------------------------------------------------------

interface GeminiInlineResponse { key?: string; response?: { text?: string }; error?: unknown }
type GeminiDest = { file_name?: string; fileName?: string; inlined_responses?: Array<GeminiInlineResponse>; inlinedResponses?: Array<GeminiInlineResponse> } | undefined | null;

export async function ingestBatchOutputFromGemini(batchId: string, dest: GeminiDest) {
    // Supports file-based dest or inlined_responses
    if (dest && (dest.file_name || dest.fileName)) {
        const fileName: string = (dest.file_name ?? dest.fileName) as string;
        console.log(`[ingestBatchOutput] Downloading Gemini output for batch ${batchId} (file ${fileName})`);
        const tmpDir = path.join(process.env.NODE_ENV === 'development' ? path.join(process.cwd(), 'tmp') : os.tmpdir(), 'facturas-batch');
        try {
            await fs.promises.mkdir(tmpDir, { recursive: true, mode: 0o755 });
        } catch (mkdirError) {
            const errorMsg = mkdirError instanceof Error ? mkdirError.message : 'Unknown error creating tmp directory';
            console.error(`[ingestBatchOutput] Failed to create tmp directory for batch ${batchId}:`, mkdirError);
            await updateBatchProgress(batchId, {
                status: 'FAILED',
                errors: [
                    {
                        kind: 'DATABASE_ERROR',
                        message: `Failed to create temporary directory: ${errorMsg}`,
                        timestamp: new Date().toISOString(),
                    },
                ],
                completedAt: new Date(),
            });
            return;
        }
        let downloadedPath: string;
        try {
            downloadedPath = path.join(tmpDir, path.basename(fileName));
            await gemini.files.download({ file: fileName as unknown as string, downloadPath: downloadedPath });

            // Wait for the file to be fully downloaded with retry logic
            const maxWaitTime = 60000; // 60 seconds max wait
            const checkInterval = 500; // Check every 500ms
            const startTime = Date.now();
            let fileReady = false;
            let lastSize = -1;
            let stableSizeCount = 0;

            while (Date.now() - startTime < maxWaitTime) {
                try {
                    const stats = await fs.promises.stat(downloadedPath);
                    if (stats.isFile()) {
                        // Check if file size is stable (hasn't changed for 2 consecutive checks)
                        if (stats.size === lastSize && stats.size > 0) {
                            stableSizeCount++;
                            if (stableSizeCount >= 2) {
                                fileReady = true;
                                console.log(`[ingestBatchOutput] File download verified: ${downloadedPath} (${stats.size} bytes)`);
                                break;
                            }
                        } else {
                            stableSizeCount = 0;
                        }
                        lastSize = stats.size;
                    }
                } catch (err) {
                    // File doesn't exist yet, continue waiting
                }
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }

            if (!fileReady) {
                console.warn(`[ingestBatchOutput] File download timeout or unstable for ${downloadedPath}, attempting to proceed anyway`);
            }

            if (!await fs.promises.access(downloadedPath).then(() => true).catch(() => false)) {
                try {
                    const files = await fs.promises.readdir(tmpDir);
                    console.log(`[ingestBatchOutput] Expected file: ${downloadedPath}, Available files: ${files.join(', ')}`);
                    const fileStats = await Promise.all(files.map(async (file) => {
                        try { const fullPath = path.join(tmpDir, file); const stats = await fs.promises.stat(fullPath); return { file, fullPath, mtime: stats.mtime, isFile: stats.isFile() }; }
                        catch { return null; }
                    }));
                    const validFiles = fileStats.filter(s => s !== null && s.isFile) as Array<{ file: string; fullPath: string; mtime: Date; isFile: boolean; }>;
                    const expectedBaseName = path.basename(fileName);
                    const matchingFiles = validFiles.filter(f => f.file === expectedBaseName || f.file.includes(expectedBaseName.split('.')[0]));
                    const recentJsonlFiles = validFiles.filter(f => f.file.endsWith('.jsonl') && (Date.now() - f.mtime.getTime()) < 10 * 60 * 1000);
                    let selectedFile: typeof validFiles[0] | null = null;
                    if (matchingFiles.length > 0) {
                        selectedFile = matchingFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
                        console.log(`[ingestBatchOutput] Using matching file: ${selectedFile.file}`);
                    } else if (recentJsonlFiles.length === 1) {
                        selectedFile = recentJsonlFiles[0];
                        console.log(`[ingestBatchOutput] Using recent .jsonl file: ${selectedFile.file}`);
                    } else if (recentJsonlFiles.length > 1) {
                        throw new Error(`Multiple recent .jsonl files found, cannot determine which belongs to batch ${batchId}. Files: ${recentJsonlFiles.map(f => f.file).join(', ')}`);
                    } else {
                        throw new Error(`No suitable batch result file found for batch ${batchId}. Expected: ${expectedBaseName}, Available: ${files.join(', ')}`);
                    }
                    downloadedPath = selectedFile.fullPath;
                    console.log(`[ingestBatchOutput] Selected file: ${downloadedPath}`);
                } catch (dirErr) {
                    throw new Error(`Failed to process tmp directory ${tmpDir}: ${dirErr instanceof Error ? dirErr.message : 'Unknown error'}`);
                }
            }
            try { const stats = await fs.promises.stat(downloadedPath); if (stats.isDirectory()) { throw new Error(`Downloaded path ${downloadedPath} is a directory, not a file`); } }
            catch (statErr) { throw new Error(`Cannot access file stats for ${downloadedPath}: ${statErr instanceof Error ? statErr.message : 'Unknown error'}`); }
            console.log(`[ingestBatchOutput] Using streaming parser for ${downloadedPath}`);
            const parsedLines = await parseJsonLinesFromFile(downloadedPath);
            const processingResult = await processOutputLines(parsedLines);

            // Clean up the downloaded file only if there are no actual errors (i.e., only duplicates or complete success)
            // Keep the file if there are actual errors for debugging
            if (!processingResult.hasActualErrors) {
                try {
                    await fs.promises.unlink(downloadedPath);
                    console.log(`[ingestBatchOutput] Cleaned up downloaded result file: ${downloadedPath} (${processingResult.hasOnlyDuplicates ? 'only duplicates' : 'no errors'})`);
                } catch (cleanupErr) {
                    console.warn(`[ingestBatchOutput] Failed to clean up downloaded result file ${downloadedPath}:`, cleanupErr);
                }
            } else {
                console.log(`[ingestBatchOutput] Keeping failed batch result file for debugging: ${downloadedPath} (${processingResult.successCount} success, ${processingResult.failedCount} failed with actual errors)`);
            }

            // Clean up old temporary files (older than 1 hour)
            try {
                const files = await fs.promises.readdir(tmpDir);
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                for (const file of files) {
                    try {
                        const filePath = path.join(tmpDir, file);
                        const stats = await fs.promises.stat(filePath);
                        if (stats.isFile() && stats.mtime.getTime() < oneHourAgo) {
                            await fs.promises.unlink(filePath);
                            console.log(`[ingestBatchOutput] Cleaned up old tmp file: ${file}`);
                        }
                    } catch { }
                }
            } catch { }
        } catch (error) {
            console.error(`[ingestBatchOutput] Error downloading or processing batch results for ${batchId}:`, error);
            throw error;
        }
    } else if (dest && (dest.inlined_responses || dest.inlinedResponses)) {
        const inlined = (dest.inlined_responses ?? dest.inlinedResponses) as Array<GeminiInlineResponse>;
        const parsedLines = inlined.map((r) => ({ ...r }));
        // For inlined responses, we don't have a file to clean up, so we don't need the result
        await processOutputLines(parsedLines);
    } else {
        console.warn(`[ingestBatchOutput] Gemini batch ${batchId} has no dest results`);
    }

    interface ErrorContext {
        custom_id?: string;
        status_code?: number;
        hasChoices?: boolean;
        rawContent?: string;
        rawLine?: string;
        extractedData?: ExtractedPdfData;
        result?: CreateInvoiceResult;
        itemsExtracted?: number;
    }

    async function processOutputLines(entries: unknown[]): Promise<{ hasActualErrors: boolean; hasOnlyDuplicates: boolean; totalProcessed: number; successCount: number; failedCount: number }> {
        let success = 0;
        let failed = 0;
        const errors: Array<{ lineIndex: number; error: string; context?: ErrorContext }> = [];
        let duplicateErrors = 0;
        let actualErrors = 0;

        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const lineIndex = index + 1;
            try {
                const parsedObj = entry as Record<string, unknown> | null;
                if (!parsedObj || typeof parsedObj !== 'object') {
                    const errorMsg = 'Entry is not an object';
                    console.error(`[ingestBatchOutput] ${errorMsg} at line ${lineIndex}`);
                    errors.push({ lineIndex, error: errorMsg });
                    failed++;
                    actualErrors++;
                    continue;
                }
                const response = parsedObj.response as Record<string, unknown> | undefined;
                const errorPayload = parsedObj.error as unknown;
                const key = (parsedObj.key as string) ?? (parsedObj.custom_id as string) ?? 'unknown';

                if (errorPayload) {
                    const errorMsg = `Gemini request failed: ${JSON.stringify(errorPayload)}`;
                    console.error(`[ingestBatchOutput] ${errorMsg} (key: ${key})`);
                    errors.push({ lineIndex, error: errorMsg, context: { custom_id: key } });
                    failed++;
                    actualErrors++;
                    continue;
                }

                let content: string | undefined;
                let finishReason: string | undefined;
                if (response) {
                    const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
                    const firstCandidate = candidates?.[0];
                    finishReason = firstCandidate?.finishReason as string | undefined;

                    const contentObj = firstCandidate?.content as Record<string, unknown> | undefined;
                    const parts = contentObj?.parts as Array<Record<string, unknown>> | undefined;
                    if (Array.isArray(parts)) {
                        content = parts
                            .map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? ((p as { text?: string }).text) : ''))
                            .join('');
                    }
                    const respText = (response as { text?: unknown }).text;
                    if ((!content || content.length === 0) && typeof respText === 'string') {
                        content = respText;
                    }
                }

                if (!content || content.length === 0) {
                    const errorMsg = finishReason === 'MAX_TOKENS'
                        ? 'Response truncated due to MAX_TOKENS and no content extracted'
                        : 'No content in Gemini response';
                    console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (key: ${key})`);
                    errors.push({ lineIndex, error: errorMsg, context: { custom_id: key } });
                    failed++;
                    actualErrors++;
                    continue;
                }

                // Check for MAX_TOKENS truncation in batch responses
                // In batch mode, we CANNOT recover (no access to original PDF)
                // We MUST reject truncated responses to prevent incomplete data
                if (finishReason === 'MAX_TOKENS') {
                    console.error(`[ingestBatchOutput] ${key}: Response truncated due to MAX_TOKENS. Invoice CANNOT be processed in batch mode.`);

                    // Try to parse partial data to report how many items we got before truncation
                    let itemsBeforeTruncation = 0;
                    try {
                        const partialData = parseTextBasedExtraction(content, { suppressWarnings: true });
                        itemsBeforeTruncation = partialData?.items?.length || 0;
                    } catch { }

                    const errorMsg = itemsBeforeTruncation > 0
                        ? `Invoice truncated due to MAX_TOKENS (extracted ${itemsBeforeTruncation} items, but more exist). This invoice has too many line items for batch processing. Please upload this specific PDF manually for automatic recovery.`
                        : `Invoice truncated due to MAX_TOKENS. Please upload this PDF manually for automatic recovery.`;

                    errors.push({
                        lineIndex,
                        error: errorMsg,
                        context: { custom_id: key, itemsExtracted: itemsBeforeTruncation }
                    });
                    failed++;
                    actualErrors++;
                    continue; // Skip processing this invoice entirely
                }

                const extractedData = parseTextBasedExtraction(content);
                if (!extractedData) {
                    const errorMsg = `Failed to parse text-based extracted data`;
                    const identifier = key ?? 'unknown';
                    console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (id: ${identifier})`);
                    console.error(`[ingestBatchOutput] Raw content: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
                    errors.push({
                        lineIndex,
                        error: errorMsg,
                        context: { custom_id: identifier, rawContent: content.substring(0, 500) }
                    });
                    failed++;
                    actualErrors++;
                    continue;
                }

                const result = await saveExtractedInvoice(extractedData, key ?? undefined);
                if (result.success) {
                    success++;
                } else {
                    const errorMsg = `Error al guardar la factura: ${result.message}`;
                    console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex} (key: ${key ?? 'unknown'})`);
                    errors.push({
                        lineIndex,
                        error: errorMsg,
                        context: { custom_id: key, result }
                    });
                    failed++;

                    // Check if this is a duplicate invoice error
                    if (result.message && result.message.includes('already exists')) {
                        duplicateErrors++;
                    } else {
                        actualErrors++;
                    }
                }
            } catch (err) {
                const errorMsg = `Error al procesar la línea: ${(err as Error).message}`;
                console.error(`[ingestBatchOutput] ${errorMsg} for line ${lineIndex}`);
                errors.push({
                    lineIndex,
                    error: errorMsg,
                    context: { rawLine: JSON.stringify(entry).substring(0, 500) }
                });
                failed++;
                actualErrors++;
            }
        }

        await updateBatchProgress(batchId, {
            successfulFiles: success,
            failedFiles: failed,
            processedFiles: success + failed,
            completedAt: new Date(),
        });

        console.log(`[ingestBatchOutput] Persisted ${success} invoices, ${failed} errors for batch ${batchId}`);

        if (errors.length > 0) {
            console.error(`[ingestBatchOutput] Detailed errors for batch ${batchId}:`);
            errors.forEach(({ lineIndex, error, context }) => {
                console.error(`  Line ${lineIndex}: ${error}`);
                if (context) {
                    console.error(`    Context:`, context);
                }
            });

            const structuredErrors = errors.map(({ lineIndex, error, context }) => {
                const fileName = context?.custom_id || `line-${lineIndex}`;
                const maybeResult = context?.result as CreateInvoiceResult | undefined;
                const invoiceCodeFromResult = maybeResult?.message && maybeResult.message.includes('Invoice')
                    ? maybeResult.message.match(/Invoice\s([^\s]+)\s/)
                    : null;

                const invoiceCode = context?.extractedData && typeof context.extractedData === 'object'
                    ? (context.extractedData as ExtractedPdfData).invoiceCode
                    : invoiceCodeFromResult?.[1];

                const kind: BatchErrorDetail['kind'] = context?.rawLine
                    ? 'PARSING_ERROR'
                    : maybeResult?.message?.includes('already exists')
                        ? 'DUPLICATE_INVOICE'
                        : maybeResult
                            ? 'DATABASE_ERROR'
                            : 'UNKNOWN';

                return {
                    kind,
                    message: `${fileName}: ${error}`,
                    fileName,
                    invoiceCode,
                    timestamp: new Date().toISOString(),
                } satisfies BatchErrorDetail;
            }).slice(0, 100);

            await updateBatchProgress(batchId, {
                errors: structuredErrors,
            });
        }

        // Return detailed error information for cleanup decision
        return {
            hasActualErrors: actualErrors > 0,
            hasOnlyDuplicates: errors.length > 0 && actualErrors === 0 && duplicateErrors > 0,
            totalProcessed: entries.length,
            successCount: success,
            failedCount: failed
        };
    }
}

// ---------------------------------------------------------------------------
// 🛑  Server Action: Cancel all active batches
// ---------------------------------------------------------------------------

export async function cancelAllBatches(): Promise<{ success: boolean; message: string; cancelledCount: number }> {
    const user = await requireAuth();

    try {
        // Get all active batches for this user
        const activeBatches = await prisma.batchProcessing.findMany({
            where: {
                userId: user.id,
                status: {
                    in: ['PENDING', 'PROCESSING']
                }
            }
        });

        if (activeBatches.length === 0) {
            return {
                success: true,
                message: 'No active batches to cancel.',
                cancelledCount: 0
            };
        }

        let cancelledCount = 0;

        for (const batch of activeBatches) {
            try {
                // Call Gemini API to cancel the batch
                await gemini.batches.cancel({ name: batch.id });

                // Update batch status in database
                await updateBatchProgress(batch.id, {
                    status: 'CANCELLED',
                    completedAt: new Date(),
                });

                cancelledCount++;
            } catch (error) {
                console.error(`Failed to cancel batch ${batch.id}:`, error);
                // Continue with other batches even if one fails
            }
        }

        const message = cancelledCount === activeBatches.length
            ? `Successfully cancelled ${cancelledCount} batch(es).`
            : `Cancelled ${cancelledCount} out of ${activeBatches.length} batch(es). Some batches may have already completed.`;

        return {
            success: true,
            message,
            cancelledCount
        };
    } catch (error) {
        console.error('Error cancelling batches:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred while cancelling batches',
            cancelledCount: 0
        };
    }
} 