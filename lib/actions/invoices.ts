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

async function callPdfExtractAPI(file: File): Promise<CallPdfExtractAPIResponse> {
    try {
        console.log(`Starting PDF extraction for file: ${file.name}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

        let pages;
        try {
            pages = await pdfToPng(arrayBuffer, {
                disableFontFace: true,
                useSystemFonts: true,
                viewportScale: 3, // Balance between resolution and full page coverage
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

        const promptText = `Analyze these invoice images, which collectively represent a single invoice, with extreme care and extract the following information in a structured way.
Consolidate all information across all provided images into a single, coherent invoice structure.
The invoice-level details (provider, invoice code, date, total amount) may appear on any page, but should be extracted once for the entire invoice.
Aggregate all line items from all pages into a single list.
IMPORTANT: Only extract data that is clearly visible on the invoice. Do NOT guess or infer information. If an optional field is not present, use null. Extract all text, especially codes and numbers, EXACTLY as it appears.

CRITICAL NOTE FOR NUMBER RECOGNITION:
- Pay special attention to distinguishing between similar-looking numbers, especially:
  * The number "5" vs "3" - Look for the flat top of "5" vs the curved top of "3"
  * The number "8" vs "6" - Note the complete shape of "8" vs the open top of "6"
  * The number "0" vs "6" - Look for the complete oval of "0" vs the curved shape of "6"
- For material codes and quantities, verify each digit multiple times
- If a number is unclear or ambiguous, look for context clues such as:
  * Matching totals (quantity x unit price should equal total price)
  * Consistent formatting with other similar numbers in the document
  * Related entries or subtotals that could validate the number

1. Provider Information (invoice issuer):
   - Company name
   - Provider Tax ID: Extract any official tax identification number found (e.g., VAT ID, Company Registration Number, etc.).
     If a Spanish CIF/NIF/DNI is present, ensure it matches these formats:
       * CIF: Letter + 8 digits (e.g., B12345678)
       * NIF: 8 digits + letter (e.g., 12345678A)
       * DNI: 8 digits + letter (e.g., 12345678Z)
     If no Spanish-formatted ID is found, provide the most relevant tax identifier present on the invoice for the \`cif\` field. If no tax ID is found, use null for cif.
   - Provider email: Extract the provider's primary email address if available. If not visible, use null.
   - Provider phone: Extract the provider's primary phone number if available. If not visible, use null.
2. Invoice Details:
   - Unique invoice code
   - Issue date (must be a valid date)
   - Total amount (must be a decimal number with 2 decimal places)
3. Line Items (IMPORTANT: Extract EVERY line item listed across all provided pages. Each distinct line entry on the invoice should be a separate item in your response, even if the material name appears to be the same as a previous line. Pay close attention to quantities, prices, and any subtle variations that differentiate them):
   For each line item extracted:
   - Material name/identifier: IMPORTANT RULES FOR MATERIAL NAME EXTRACTION:
     * If both a descriptive name AND a code are present, use the descriptive name as materialName
     * If only a code is present (e.g., "21PA0010771"), use the code as materialName but prefix it with "CODE: " (e.g., "CODE: 21PA0010771")
   - isMaterial: boolean - Set to true if the item is a physical material or product. Set to false if it's a service, tax, fee, or other non-material charge (e.g., "Ecotasa", "Transporte", "Handling Fee").
   - Quantity (must be a decimal number with 2 decimal places, extracted exactly)
   - Unit price (must be a decimal number with 2 decimal places, extracted exactly)
   - Total price per item (must be quantity * unit price, extracted exactly. If not present, calculate it carefully.)
   - Item date if different from invoice date (in ISO format). If not visible, assume same as invoice date and omit.
   - Work Order/CECO: CRITICAL - Follow these rules to identify the correct Work Order. Your main goal is to find the project or cost center code that contains "OT" (Orden de Trabajo).

     1.  **Identify the Source:**
         *   Look for a global work order reference at the top of the invoice, often labeled "Obra", "Proyecto", or "Work Order". This global reference applies to all items.
         *   If no global reference is found, look for per-item references labeled "OT" or "CECO".

     2.  **Validation Rules (Strict):**
         *   A valid work order **MUST** contain the letters "OT".
         *   **DO NOT** use order numbers ("Pedidos") as the work order. These often start with 'P' (e.g., "Pedido 21P0015614") and are not the correct code.
         *   Ignore any other codes, references, or text that do not explicitly contain "OT".

     3.  **Extraction and Formatting:**
         *   If a valid global work order containing "OT" is found, use it for ALL line items.
         *   Extract only the relevant code part. For example, from "Obra: OT 6118 ESCOLA EINA", the code is "OT 6118".
         *   **Format the final code by replacing any spaces with a hyphen (-).** For example, "OT 6118" MUST become "OT-6118".
         *   If no reference containing "OT" can be found anywhere, use \`null\`.

     To summarize: Your only target is a code containing "OT". Find it, format it (e.g., "OT-6118"), and apply it. Ignore everything else, especially "Pedido" codes.
   - Description: Extract any additional description text specific to this line item (different from the material name)
   - Line Number: If line items are numbered on the invoice, extract the line number
   Note: If the same material appears multiple times with different dates or prices,
   create separate line items for each occurrence.

Verification Step: If possible, after extracting all items, mentally sum their total prices. This sum should ideally be close to the overall invoice 'totalAmount'. If there's a large discrepancy, please double-check item extractions. If the invoice explicitly states a grand total that differs from the sum of items, prioritize the explicitly stated grand total for the 'totalAmount' field.

Database Schema Requirements:
- Provider must have a tax ID (\`cif\`) extracted if visible. This is a critical field. Prioritize Spanish CIF/NIF/DNI if available; otherwise, use any other official provider tax identifier found. If no Tax ID is found on the invoice, the \`cif\` field in the JSON should be null.
- Include provider email and phone if these are present on the invoice, otherwise use null.
- Invoice must have a unique invoice code and valid issue date.
- Each line item represents an InvoiceItem linked to a Material.
- All monetary values must be Decimal(10,2).
- All quantities must be Decimal(10,2).

Format the response as valid JSON exactly like this:
{
  "invoiceCode": "string - unique invoice identifier - usually "Nº de documento",
  "provider": {
    "name": "string - company name",
    "cif": "string | null - provider tax ID (any official format, Spanish CIF/NIF/DNI preferred if available, null if not found)",
    "email": "string | null - optional provider email extracted from invoice, null if not found",
    "phone": "string | null - optional provider phone extracted from invoice, null if not found",
    "address": "string | null - optional address, null if not found"
  },
  "issueDate": "string - ISO date format",
  "totalAmount": "number - total invoice amount with 2 decimal places",
  "items": [
    {
      "materialName": "string - the exact material name as it appears in the invoice",
      "isMaterial": "boolean - true if it's a material, false otherwise (e.g., for fees, taxes like Ecotasa, transport)",
      "quantity": "number - quantity with 2 decimal places",
      "unitPrice": "number - price per unit with 2 decimal places",
      "totalPrice": "number - quantity * unitPrice with 2 decimal places",
      "itemDate": "string | null - optional ISO date format if different from invoice date, null if not specified or same as invoice date",
      "workOrder": "string | null - The FULL alphanumeric work order (e.g., '38600-OT-4077-1426'), null if not found",
      "description": "string | null - additional description text for this line item, null if not present",
      "lineNumber": "number | null - line number if items are numbered on the invoice, null if not numbered"
    }
  ]
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
    let provider = await tx.provider.findUnique({
        where: { cif },
    });

    if (!provider) {
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
    } else {
        provider = await tx.provider.update({
            where: { cif },
            data: {
                name,
                email: email || provider.email,
                phone: phone || provider.phone,
                address: address || provider.address,
                type: providerType, // Update type if needed
            }
        });
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
            // 1. Find or create provider
            const provider = await findOrCreateProviderTx(tx, {
                name: data.provider.name,
                cif: data.provider.cif || `MANUAL-${Date.now()}`, // Ensure CIF is not null
                email: data.provider.email || undefined,
                phone: data.provider.phone || undefined,
            });

            // 2. Check if invoice already exists
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

            // 3. Create invoice
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

            // 4. Process each item
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