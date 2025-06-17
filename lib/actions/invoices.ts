'use server'

import { prisma } from "@/lib/db";
import { type ExtractedPdfData, type ExtractedPdfItemData } from "@/lib/types/pdf";
import { Prisma, type Provider, type Material, type Invoice, type InvoiceItem, type PriceAlert, type MaterialProvider } from "@/generated/prisma";
import { revalidatePath } from "next/cache";
import { pdfToPng } from "pdf-to-png-converter";
import OpenAI from "openai";

// Ensure we have the OpenAI API key
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
    // This will cause a build-time error if the key is missing.
    // For runtime, consider a more graceful handling or logging if appropriate.
    throw new Error("Missing OPENAI_API_KEY environment variable. This is required for PDF processing.");
}

const openai = new OpenAI({
    apiKey: openaiApiKey,
});

export interface CreateInvoiceResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    fileName?: string;
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

// New interfaces for rate limit handling
interface OpenAIRateLimitHeaders {
    limitRequests?: number;
    remainingRequests?: number;
    resetRequestsTimeMs?: number;
    limitTokens?: number;
    remainingTokens?: number;
    resetTokensTimeMs?: number;
}

interface CallPdfExtractAPIResponse {
    extractedData: ExtractedPdfData | null;
    error?: string;
    rateLimitHeaders?: OpenAIRateLimitHeaders;
}

// Helper function to parse OpenAI's rate limit reset time string (e.g., "60s", "200ms")
function parseOpenAIResetTime(timeStr: string | null | undefined): number {
    if (!timeStr) return 60000; // Default to 1 minute if unknown

    let totalMilliseconds = 0;

    const msMatch = timeStr.match(/(\d+)ms/);
    if (msMatch) {
        totalMilliseconds += parseInt(msMatch[1], 10);
    }

    const sMatch = timeStr.match(/(\d+)s/);
    if (sMatch) {
        totalMilliseconds += parseInt(sMatch[1], 10) * 1000;
    }

    const mMatch = timeStr.match(/(\d+)m/);
    if (mMatch) {
        totalMilliseconds += parseInt(mMatch[1], 10) * 60 * 1000;
    }

    // If only a number is provided, assume it's seconds (less common for this header but a fallback)
    if (totalMilliseconds === 0 && /^\d+$/.test(timeStr)) {
        return parseInt(timeStr, 10) * 1000;
    }

    return totalMilliseconds > 0 ? totalMilliseconds : 60000; // Fallback to 60s if parsing fails or yields 0
}

// Function to check if a provider should be ignored
function isBlockedProvider(providerName: string): boolean {
    const normalizedName = providerName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/\s+/g, ''); // Remove spaces

    const blockedProviders = [
        'constraula',
        'sorigué',
        'sorigüe',
        'soriguè',
        'soriguê',
        'sorigui'
    ].map(name => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ''));

    return blockedProviders.some(blocked => normalizedName.includes(blocked));
}

async function callPdfExtractAPI(file: File): Promise<CallPdfExtractAPIResponse> {
    try {
        console.log(`Starting PDF extraction for file: ${file.name}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

        let pages;
        try {
            pages = await pdfToPng(arrayBuffer, {
                disableFontFace: true,
                useSystemFonts: false,
                viewportScale: 4, // Balance between resolution and full page coverage
                strictPagesToProcess: false,
                verbosityLevel: 0,
            });



        } catch (conversionError: unknown) {
            console.error(`Error during pdfToPng conversion for ${file.name}:`, conversionError);
            if (typeof conversionError === 'object' && conversionError !== null && 'code' in conversionError && (conversionError as { code: unknown }).code === 'InvalidArg' && 'message' in conversionError && typeof (conversionError as { message: unknown }).message === 'string' && (conversionError as { message: string }).message.includes('Convert String to CString failed')) {
                throw new Error(`PDF_CONVERSION_FAILED: ${file.name} could not be converted due to internal font/text encoding issues. Details: ${(conversionError as { message: string }).message}`);
            }
            throw conversionError;
        }

        if (!pages || pages.length === 0) {
            console.error(`Failed to convert PDF to images for ${file.name}`);
            return { extractedData: null, error: "Failed to convert PDF to images.", rateLimitHeaders: undefined };
        }

        // Log the dimensions of the first page to help with debugging
        if (pages[0]) {
            console.log(`First page dimensions for ${file.name}: ${pages[0].width}x${pages[0].height}`);
        }

        const imageUrls = pages.map((page, index) => {
            if (!page?.content) {
                console.warn(`Skipping page ${index + 1} in ${file.name} due to missing content during image URL construction`);
                return null;
            }
            return {
                type: "image_url" as const,
                image_url: {
                    url: `data:image/png;base64,${page.content.toString("base64")}`,
                    detail: "high" as const,
                }
            };
        }).filter(Boolean) as { type: "image_url"; image_url: { url: string; detail: "high"; } }[];

        if (imageUrls.length === 0) {
            console.error(`No valid page images could be prepared for OpenAI for file: ${file.name}`);
            return { extractedData: null, error: "No valid page images could be prepared for OpenAI.", rateLimitHeaders: undefined };
        }

        const promptText = `Extract invoice data from these images (consolidate all pages into a single invoice). Only extract visible data, use null for missing optional fields.

NUMBER ACCURACY: Distinguish 5 vs 3 (flat vs curved top), 8 vs 6 (complete vs open), 0 vs 6 (oval vs curved). Verify quantities and codes carefully.

PROVIDER (Invoice Issuer - NOT the client):
- Find company at TOP of invoice, labeled "Vendedor/Proveedor/Emisor"
- Extract: name, tax ID (CIF/NIF/DNI format: Letter+8digits or 8digits+letter), email, phone (the first one present), address
- Tax ID is CRITICAL for deduplication - scan entire document

INVOICE: Extract code, issue date (ISO), total amount

LINE ITEMS (extract ALL items from all pages):
- materialName: Use descriptive name if available, otherwise "CODE: [code]"
- isMaterial: true for physical items, false for services/fees/taxes
- quantity, unitPrice, totalPrice (2 decimals)
- itemDate: ISO format if different from invoice date
- workOrder: Find simple 3-5 digit OT number (e.g., "Obra: 4077" → "OT-4077"). Avoid complex refs like "38600-OT-4077-1427". Apply globally to all items.
- description, lineNumber

JSON format:
{
  "invoiceCode": "string",
  "provider": {
    "name": "string",
    "cif": "string|null",
    "email": "string|null", 
    "phone": "string|null",
    "address": "string|null"
  },
  "issueDate": "string",
  "totalAmount": "number",
  "items": [{
    "materialName": "string",
    "isMaterial": "boolean",
    "quantity": "number",
    "unitPrice": "number", 
    "totalPrice": "number",
    "itemDate": "string|null",
    "workOrder": "string|null",
    "description": "string|null",
    "lineNumber": "number|null"
  }]
}`;

        console.log(`Calling OpenAI API for file: ${file.name} with ${imageUrls.length} page images.`);

        const apiCallResponse = await openai.chat.completions.create({
            model: "gpt-4.1",
            temperature: 0.1,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: promptText },
                        ...imageUrls // Spread the array of image_url objects
                    ]
                }
            ],
            response_format: { type: "json_object" },
        }).withResponse();

        const content = apiCallResponse.data.choices[0].message.content;
        const responseHeaders = apiCallResponse.response.headers;

        const rateLimitHeaders: OpenAIRateLimitHeaders = {
            limitRequests: responseHeaders.get('x-ratelimit-limit-requests') ? parseInt(responseHeaders.get('x-ratelimit-limit-requests')!, 10) : undefined,
            remainingRequests: responseHeaders.get('x-ratelimit-remaining-requests') ? parseInt(responseHeaders.get('x-ratelimit-remaining-requests')!, 10) : undefined,
            resetRequestsTimeMs: parseOpenAIResetTime(responseHeaders.get('x-ratelimit-reset-requests')),
            limitTokens: responseHeaders.get('x-ratelimit-limit-tokens') ? parseInt(responseHeaders.get('x-ratelimit-limit-tokens')!, 10) : undefined,
            remainingTokens: responseHeaders.get('x-ratelimit-remaining-tokens') ? parseInt(responseHeaders.get('x-ratelimit-remaining-tokens')!, 10) : undefined,
            resetTokensTimeMs: parseOpenAIResetTime(responseHeaders.get('x-ratelimit-reset-tokens')),
        };

        if (!content) {
            console.error(`No content in OpenAI response for ${file.name}`);
            return { extractedData: null, error: "No content from OpenAI.", rateLimitHeaders };
        }

        try {
            const extractedData = JSON.parse(content) as ExtractedPdfData;
            console.log(`Successfully parsed OpenAI JSON response for multi-page file: ${file.name}. Items extracted: ${extractedData.items?.length || 0}`);

            if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                console.warn(`Consolidated response for ${file.name} missing crucial invoice-level data. Data: ${JSON.stringify(extractedData)}`);
            }
            if (!extractedData.items || extractedData.items.length === 0) {
                console.warn(`File ${file.name} yielded invoice-level data but no line items were extracted by AI from any page.`);
            }

            return { extractedData, rateLimitHeaders };

        } catch (parseError) {
            console.error(`Error parsing consolidated OpenAI response for ${file.name}:`, parseError);
            return { extractedData: null, error: "Error parsing OpenAI response.", rateLimitHeaders };
        }

    } catch (error) {
        console.error(`Error extracting data from PDF ${file.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error during PDF extraction.";
        if (error instanceof Error && error.message.startsWith('PDF_CONVERSION_FAILED:')) {
            return { extractedData: null, error: error.message, rateLimitHeaders: undefined }; // No headers if conversion failed before API call
        }
        // Attempt to get headers if error is from OpenAI API call itself (e.g. 429, 500)
        // For now, this example returns undefined headers for general catch block
        // A more sophisticated approach would involve checking if `error` is an APIError from OpenAI client
        // and then trying to access `error.response.headers`
        return { extractedData: null, error: errorMessage, rateLimitHeaders: undefined };
    }
}

async function findOrCreateProviderTx(tx: Prisma.TransactionClient, providerData: ExtractedPdfData['provider'], providerType: 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL' = 'MATERIAL_SUPPLIER'): Promise<Provider> {
    const { cif, name, email, phone, address } = providerData;

    // Check if provider is blocked
    if (isBlockedProvider(name)) {
        throw new Error(`Provider '${name}' is blocked and cannot be processed.`);
    }

    // Ensure CIF is available for provider unification
    if (!cif) {
        throw new Error(`Provider '${name}' does not have a CIF. All providers must have a CIF for proper unification.`);
    }

    // First check by CIF
    let provider = await tx.provider.findUnique({
        where: { cif },
    });

    // If no provider found by CIF, check by phone number (duplicate detection)
    if (!provider && phone) {
        provider = await tx.provider.findFirst({
            where: { phone: phone },
        });

        if (provider) {
            console.log(`Found existing provider by phone number: ${phone}. Updating CIF from ${provider.cif} to ${cif}`);
            // Update the existing provider with the new CIF and other data
            provider = await tx.provider.update({
                where: { id: provider.id },
                data: {
                    cif, // Update CIF to the new one
                    name, // Update name to keep it current
                    email: email || provider.email,
                    phone: phone || provider.phone,
                    address: address || provider.address,
                    type: providerType,
                }
            });
            console.log(`Updated existing provider found by phone: ${provider.name} (New CIF: ${cif})`);
            return provider;
        }
    }

    if (!provider) {
        // Create new provider
        provider = await tx.provider.create({
            data: {
                cif,
                name,
                email,
                phone,
                address,
                type: providerType,
            },
        });
        console.log(`Created new provider: ${name} (CIF: ${cif})`);
    } else {
        // Update existing provider found by CIF with the most recent data
        provider = await tx.provider.update({
            where: { cif },
            data: {
                name, // Always update name to keep it current
                email: email || provider.email, // Keep new email if provided, otherwise keep existing
                phone: phone || provider.phone, // Keep new phone if provided, otherwise keep existing
                address: address || provider.address, // Keep new address if provided, otherwise keep existing
                type: providerType, // Update type if needed
            }
        });
        console.log(`Updated existing provider with CIF ${cif}: ${provider.name} -> ${name}`);
    }
    return provider;
}

async function findOrCreateMaterialTx(tx: Prisma.TransactionClient, materialName: string, materialCode?: string, providerType?: string): Promise<Material> {
    const normalizedName = materialName.trim();
    let material: Material | null = null;

    if (materialCode) {
        material = await tx.material.findUnique({
            where: { code: materialCode },
        });
    }

    if (!material) {
        material = await tx.material.findFirst({
            where: { name: { equals: normalizedName, mode: 'insensitive' } }
        });
    }

    // Set category based on provider type
    const category = providerType === 'MACHINERY_RENTAL' ? 'Alquiler Maquinaria' : 'Proveedor de Materiales';

    if (!material) {
        material = await tx.material.create({
            data: {
                code: materialCode || normalizedName.toLowerCase().replace(/\s+/g, '-').substring(0, 50),
                name: normalizedName,
                category: category,
            },
        });
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

    console.log(`[Invoice ${invoiceId} @ ${invoiceIssueDate.toISOString()}] Processing item: Material '${createdMaterial.name}' (ID: ${createdMaterial.id}), Provider ID: ${providerId}, Extracted Unit Price: ${itemData.unitPrice}, Normalized Unit Price: ${currentUnitPriceDecimal}, Item Date: ${effectiveDate.toISOString()}`);

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
            console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Previous price from ${previousInvoiceItemRecord.itemDate.toISOString()}: ${previousPrice}. Current unit price from ${effectiveDate.toISOString()}: ${currentUnitPriceDecimal}.`);

            if (!currentUnitPriceDecimal.equals(previousPrice)) {
                const priceDiff = currentUnitPriceDecimal.minus(previousPrice);
                let percentageChangeDecimal: Prisma.Decimal;

                if (!previousPrice.isZero()) {
                    percentageChangeDecimal = priceDiff.dividedBy(previousPrice).times(100);
                } else {
                    percentageChangeDecimal = new Prisma.Decimal(currentUnitPriceDecimal.isPositive() ? 9999 : -9999);
                }

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
                console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Price alert created. Old: ${previousPrice}, New: ${currentUnitPriceDecimal}, Change: ${percentageChangeDecimal.toFixed(2)}%, Effective Date: ${effectiveDate.toISOString()}`);
            } else {
                console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Price (${currentUnitPriceDecimal}) is unchanged compared to previous invoice item dated ${previousInvoiceItemRecord.itemDate.toISOString()}.`);
            }
        } else {
            console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] No chronologically prior invoice item found for material ${createdMaterial.id} / provider ${providerId} before ${effectiveDate.toISOString()}. This is treated as the first price recording for alert purposes.`);
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
                    console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Updating MaterialProvider. Old lastPriceDate: ${materialProvider.lastPriceDate?.toISOString()}, Old lastPrice: ${materialProvider.lastPrice}. New: Date ${effectiveDate.toISOString()}, Price ${currentUnitPriceDecimal}.`);
                    await tx.materialProvider.update({
                        where: { id: materialProvider.id },
                        data: {
                            lastPrice: currentUnitPriceDecimal,
                            lastPriceDate: effectiveDate,
                        },
                    });
                } else {
                    console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] MaterialProvider already reflects the latest price and date from this or a newer item. Price: ${currentUnitPriceDecimal} @ ${effectiveDate.toISOString()}. Stored: ${materialProvider.lastPrice} @ ${materialProvider.lastPriceDate?.toISOString()}. No update to MaterialProvider needed.`);
                }
            } else {
                console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Current item date (${effectiveDate.toISOString()}) is older than or same as MaterialProvider's lastPriceDate (${materialProvider.lastPriceDate?.toISOString()}). MaterialProvider not updated by this item's data.`);
            }
        } else {
            console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] First MaterialProvider record for material ${createdMaterial.id} / provider ${providerId}. Setting initial price ${currentUnitPriceDecimal} from item date ${effectiveDate.toISOString()}.`);
            await tx.materialProvider.create({
                data: {
                    materialId: createdMaterial.id,
                    providerId,
                    lastPrice: currentUnitPriceDecimal,
                    lastPriceDate: effectiveDate,
                },
            });
        }
    } else {
        console.log(`[Invoice ${invoiceId}][Item: ${createdMaterial.name}] Item is not a material. Skipping price alert and MaterialProvider updates.`);
    }

    return { invoiceItem, alert };
}

export async function createInvoiceFromFiles(
    formDataWithFiles: FormData
): Promise<{ overallSuccess: boolean; results: CreateInvoiceResult[] }> {
    const files = formDataWithFiles.getAll("files") as File[];
    if (!files || files.length === 0) {
        return { overallSuccess: false, results: [{ success: false, message: "No files provided.", fileName: "N/A" }] };
    }

    const CONCURRENCY_LIMIT = 12;
    const allFileProcessingResults: Array<ExtractedFileItem & { rateLimitHeaders?: OpenAIRateLimitHeaders }> = [];
    let lastKnownRateLimits: OpenAIRateLimitHeaders | undefined = undefined;


    console.log(`Starting extraction for ${files.length} files with a concurrency limit of ${CONCURRENCY_LIMIT}.`);

    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
        const fileChunk = files.slice(i, i + CONCURRENCY_LIMIT);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(files.length / CONCURRENCY_LIMIT);

        console.log(`Processing batch ${batchNumber} of ${totalBatches} (files ${i + 1} to ${i + fileChunk.length} of ${files.length}) for extraction.`);

        // Check rate limits before sending the batch
        if (lastKnownRateLimits?.remainingRequests !== undefined && lastKnownRateLimits.remainingRequests < fileChunk.length) {
            const waitTimeMs = lastKnownRateLimits.resetRequestsTimeMs || 60000; // Default wait 60s
            console.warn(`[RateLimit] Low remaining requests (${lastKnownRateLimits.remainingRequests}). Waiting ${waitTimeMs / 1000}s for rate limit to reset.`);
            await new Promise(resolve => setTimeout(resolve, waitTimeMs));
            // Optimistically assume requests reset after waiting
            if (lastKnownRateLimits.limitRequests !== undefined) {
                lastKnownRateLimits.remainingRequests = lastKnownRateLimits.limitRequests;
            } else {
                // If we don't know the limit, can't assume it fully reset.
                // Could set to a higher number or clear it so next batch doesn't immediately hit this.
                // For now, let's assume it's good enough for the next batch.
                lastKnownRateLimits.remainingRequests = fileChunk.length * 2; // Optimistic guess
            }
        }


        const chunkExtractionPromises = fileChunk.map(async (file): Promise<ExtractedFileItem & { rateLimitHeaders?: OpenAIRateLimitHeaders }> => {
            console.log(`[Batch ${batchNumber}] Processing file for extraction: ${file.name}`);
            if (file.size === 0) {
                console.warn(`[Batch ${batchNumber}] Skipping empty file: ${file.name}`);
                return { file, extractedData: null, error: "File is empty.", fileName: file.name };
            }
            if (file.type !== 'application/pdf') {
                console.warn(`[Batch ${batchNumber}] Skipping non-PDF file: ${file.name}, type: ${file.type}`);
                return { file, extractedData: null, error: "File is not a PDF.", fileName: file.name };
            }

            try {
                // Call the modified function that returns headers
                const { extractedData, error: extractionError, rateLimitHeaders } = await callPdfExtractAPI(file);

                if (extractionError) { // Error from callPdfExtractAPI (could be OpenAI error, parse error, etc.)
                    return { file, extractedData, error: extractionError, fileName: file.name, rateLimitHeaders };
                }

                // These validations are for the content of extractedData
                if (!extractedData) { // Should be covered by extractionError now, but good to keep
                    console.error(`[Batch ${batchNumber}] Failed to extract any usable invoice data for file: ${file.name}.`);
                    return { file, extractedData: null, error: "Failed to extract usable invoice data from PDF.", fileName: file.name, rateLimitHeaders };
                }
                if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                    console.warn(`[Batch ${batchNumber}] Missing crucial invoice-level data for file: ${file.name}. Data: ${JSON.stringify(extractedData)}`);
                    return {
                        file,
                        extractedData: extractedData,
                        error: "Missing or invalid crucial invoice-level data after PDF extraction.",
                        fileName: file.name,
                        rateLimitHeaders
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
                        fileName: file.name,
                        rateLimitHeaders
                    };
                } catch (dateError) {
                    console.warn(`[Batch ${batchNumber}] Invalid issue date format for file: ${file.name}. Date: ${extractedData.issueDate}`);
                    return {
                        file,
                        extractedData: extractedData,
                        error: `Invalid issue date format: ${extractedData.issueDate}.`,
                        fileName: file.name,
                        rateLimitHeaders
                    };
                }
            } catch (topLevelError: unknown) { // Catch errors from the map function logic itself, though callPdfExtractAPI should catch its own.
                console.error(`[Batch ${batchNumber}] Unexpected error during file processing for ${file.name}:`, topLevelError);
                const errorMessage = topLevelError instanceof Error ? topLevelError.message : "Unknown error during file item processing.";
                return { file, extractedData: null, error: errorMessage, fileName: file.name, rateLimitHeaders: undefined };
            }
        });

        const chunkResults = await Promise.all(chunkExtractionPromises);
        allFileProcessingResults.push(...chunkResults);

        // Update lastKnownRateLimits from the results in this chunk
        // Prioritize headers that indicate fewer remaining requests to be conservative
        for (const result of chunkResults) {
            if (result.rateLimitHeaders) {
                if (!lastKnownRateLimits ||
                    (result.rateLimitHeaders.remainingRequests !== undefined &&
                        (lastKnownRateLimits.remainingRequests === undefined || result.rateLimitHeaders.remainingRequests < lastKnownRateLimits.remainingRequests))) {
                    lastKnownRateLimits = result.rateLimitHeaders;
                }
            }
        }
        if (lastKnownRateLimits) {
            console.log(`[RateLimit] After Batch ${batchNumber}: Remaining Requests: ${lastKnownRateLimits.remainingRequests ?? 'N/A'}, Reset In: ${(lastKnownRateLimits.resetRequestsTimeMs ?? 0) / 1000}s. Remaining Tokens: ${lastKnownRateLimits.remainingTokens ?? 'N/A'}, Reset In: ${(lastKnownRateLimits.resetTokensTimeMs ?? 0) / 1000}s.`);
        }
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

    console.log("Processing order after sorting by issue date:", processableItems.map(p => ({
        file: p.fileName,
        date: p.extractedData?.issueDate
    })));

    // 4. Process sorted items sequentially
    for (const item of processableItems) {
        const { file, extractedData, fileName } = item;
        if (!extractedData) continue;

        try {
            console.log(`Starting database transaction for sorted invoice from file: ${fileName}, invoice code: ${extractedData.invoiceCode}, issue date: ${extractedData.issueDate}`);
            const operationResult: TransactionOperationResult = await prisma.$transaction(async (tx) => {
                const provider = await findOrCreateProviderTx(tx, extractedData.provider);

                const existingInvoice = await tx.invoice.findFirst({
                    where: {
                        invoiceCode: extractedData.invoiceCode,
                        providerId: provider.id
                    }
                });

                if (existingInvoice) {
                    console.log(`Invoice ${extractedData.invoiceCode} from provider ${provider.name} (file: ${fileName}) already exists. Skipping creation.`);
                    return {
                        success: true,
                        message: `Invoice ${extractedData.invoiceCode} from provider ${provider.name} already exists.`,
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
                // Map: materialId -> { price: Prisma.Decimal, date: Date, invoiceItemId: string }
                const intraInvoiceMaterialPriceHistory = new Map<string, { price: Prisma.Decimal; date: Date; invoiceItemId: string }>();

                for (const itemData of extractedData.items) {
                    if (!itemData.materialName) {
                        console.warn(`Skipping item due to missing material name in invoice ${invoice.invoiceCode} from file ${fileName}`);
                        continue;
                    }

                    // Add validation for required numeric fields
                    if (typeof itemData.quantity !== 'number' || isNaN(itemData.quantity)) {
                        console.warn(`Skipping item due to invalid or missing quantity in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}, Quantity: ${itemData.quantity}`);
                        continue;
                    }

                    // For items that might not have a price (e.g., informational lines), default to 0 instead of skipping.
                    if (typeof itemData.unitPrice !== 'number' || isNaN(itemData.unitPrice)) {
                        console.warn(`Missing or invalid unit price for item in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}. Defaulting to 0.`);
                        itemData.unitPrice = 0;
                    }
                    if (typeof itemData.totalPrice !== 'number' || isNaN(itemData.totalPrice)) {
                        console.warn(`Missing or invalid total price for item in invoice ${invoice.invoiceCode} from file ${fileName}. Material: ${itemData.materialName}. Defaulting to 0.`);
                        itemData.totalPrice = 0;
                    }
                    // Default isMaterial to true if not provided by AI, though it should be.
                    // This maintains previous behavior for old data or if AI misses it.
                    const isMaterialItem = typeof itemData.isMaterial === 'boolean' ? itemData.isMaterial : true;

                    // If the item is NOT a material, we still create the InvoiceItem for accounting
                    // but skip material creation, price alert logic, and MaterialProvider updates.
                    if (!isMaterialItem) {
                        console.log(`[Invoice ${invoice.invoiceCode}][Item: ${itemData.materialName}] Marked as non-material. Creating InvoiceItem only.`);
                        const quantityDecimal = new Prisma.Decimal(itemData.quantity.toFixed(2));
                        const currentUnitPriceDecimal = new Prisma.Decimal(itemData.unitPrice.toFixed(2));
                        const totalPriceDecimal = new Prisma.Decimal(itemData.totalPrice.toFixed(2));
                        const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;

                        await tx.invoiceItem.create({
                            data: {
                                invoiceId: invoice.id,
                                // For non-materials, we create a corresponding material entry for tracking purposes.
                                materialId: (await findOrCreateMaterialTx(tx, itemData.materialName, itemData.description, provider.type)).id,
                                quantity: quantityDecimal,
                                unitPrice: currentUnitPriceDecimal,
                                totalPrice: totalPriceDecimal,
                                itemDate: effectiveItemDate,
                                workOrder: itemData.workOrder || null, // Ensure OT is assigned to non-materials
                            },
                        });
                        console.log(`[Invoice ${invoice.invoiceCode}] Non-material item "${itemData.materialName}" added to invoice items. No price alert/MaterialProvider update.`);
                        continue; // Skip further material-specific processing for this item
                    }

                    // The rest of the loop is for isMaterialItem === true
                    const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialDescription, provider.type);
                    const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;
                    const currentItemUnitPrice = new Prisma.Decimal(itemData.unitPrice.toFixed(2));

                    // 1. Check for intra-invoice price changes (only for materials)
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
                            console.log(`[Invoice ${invoice.invoiceCode}][Material '${material.name}'] INTRA-INVOICE Price alert created. Old (from item ${lastSeenPriceRecordInThisInvoice.invoiceItemId} in this invoice): ${lastSeenPriceRecordInThisInvoice.price}, New (current item): ${currentItemUnitPrice}, Change: ${percentageChangeDecimal.toFixed(2)}%, Effective Date: ${effectiveItemDate.toISOString()}`);
                        }
                    }

                    // 2. Process the item (creates InvoiceItem and handles INTER-invoice alerts)
                    const { invoiceItem, alert: interInvoiceAlert } = await processInvoiceItemTx(
                        tx,
                        itemData,
                        invoice.id,
                        currentInvoiceIssueDate,
                        provider.id,
                        material,
                        isMaterialItem // Pass the flag
                    );

                    if (interInvoiceAlert) {
                        alertsCounter++;
                    }

                    // 3. Update/set price history for this material WITHIN THIS INVOICE (only for materials)
                    if (isMaterialItem) { // This check is somewhat redundant due to the outer if, but explicit
                        intraInvoiceMaterialPriceHistory.set(material.id, {
                            price: invoiceItem.unitPrice,
                            date: invoiceItem.itemDate,
                            invoiceItemId: invoiceItem.id
                        });
                    }
                }
                console.log(`Successfully created invoice ${invoice.invoiceCode} from file: ${fileName}. Total alerts for this invoice: ${alertsCounter}`);
                return {
                    success: true,
                    message: `Invoice ${invoice.invoiceCode} created successfully.`,
                    invoiceId: invoice.id,
                    alertsCreated: alertsCounter,
                    isExisting: false
                };
            });

            if (operationResult.isExisting) {
                finalResults.push({
                    success: true,
                    message: operationResult.message,
                    invoiceId: operationResult.invoiceId,
                    fileName: fileName
                });
            } else {
                finalResults.push({
                    success: operationResult.success,
                    message: operationResult.message,
                    invoiceId: operationResult.invoiceId,
                    alertsCreated: operationResult.alertsCreated,
                    fileName: fileName
                });
            }
        } catch (error) {
            console.error(`Error processing sorted invoice from ${fileName}:`, error);
            const baseMessage = `Failed to create invoice from ${fileName}`;
            let specificMessage = "An unexpected error occurred.";

            if (error instanceof Error) {
                specificMessage = error.message;
            }

            const isPrismaP2002Error = (e: unknown): e is { code: string; meta?: { target?: string[] } } => {
                return typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';
            };

            if (isPrismaP2002Error(error)) {
                if (error.meta && error.meta.target && error.meta.target.includes('invoiceCode') && extractedData) {
                    console.warn(`Duplicate invoice code '${extractedData.invoiceCode}' for file: ${fileName}`);
                    specificMessage = `An invoice with code '${extractedData.invoiceCode}' already exists.`;
                }
            }
            finalResults.push({ success: false, message: `${baseMessage}: ${specificMessage}`, fileName: fileName });
        }
    }

    const overallSuccess = finalResults.every(r => r.success);
    const newlyCreatedInvoices = finalResults.filter(r => r.success && r.invoiceId && !r.message.includes("already exists"));

    if (newlyCreatedInvoices.length > 0) {
        revalidatePath("/facturas");
        console.log("Revalidated /facturas path.");
        if (newlyCreatedInvoices.some(r => r.alertsCreated && r.alertsCreated > 0)) {
            revalidatePath("/alertas");
            console.log("Revalidated /alertas path due to new alerts.");
        }
    }

    return { overallSuccess, results: finalResults };
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
            });

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
                const material = await findOrCreateMaterialTx(tx, itemData.materialName, undefined, provider.type);

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

        if (error instanceof Error) {
            errorMessage = error.message;
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
        };
    }
} 