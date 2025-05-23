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

async function callPdfExtractAPI(file: File): Promise<ExtractedPdfData | null> {
    try {
        console.log(`Starting PDF extraction for file: ${file.name}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

        let pages;
        try {
            pages = await pdfToPng(arrayBuffer, {
                disableFontFace: true,
                // useSystemFonts: true,
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
            return null;
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
            return null;
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
  * Matching totals (quantity × unit price should equal total price)
  * Consistent formatting with other similar numbers in the document
  * Related entries or subtotals that could validate the number
- If still uncertain about a digit, indicate uncertainty in the materialDescription field

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
3. Line Items (IMPORTANT: Extract EVERY line item listed across all provided pages. Each distinct line entry on the invoice should be a separate item in your response, even if the material name or description appears to be the same as a previous line. Pay close attention to quantities, prices, and any subtle variations that differentiate them):
   For each line item extracted:
   - Material name/identifier: IMPORTANT RULES FOR MATERIAL NAME EXTRACTION:
     * If both a descriptive name AND a code are present, use the descriptive name as materialName and store the code in materialDescription
     * If only a code is present (e.g., "21PA0010771"), look for any associated description in the line item or nearby. Use the description as materialName if found, and store the code in materialDescription
     * If only a code is present and no description is found, use the code as materialName but prefix it with "CODE: " (e.g., "CODE: 21PA0010771")
     * Always preserve the exact formatting of codes and numbers
   - Material description: Include any additional details about the material, including:
     * Any material codes when the main name is descriptive
     * Any descriptive text about specifications, dimensions, or characteristics
     * If the material name is a code, try to find and include any descriptive text here
   - Quantity (must be a decimal number with 2 decimal places, extracted exactly)
   - Unit price (must be a decimal number with 2 decimal places, extracted exactly)
   - Total price per item (must be quantity * unit price, extracted exactly. If not present, calculate it carefully.)
   - Item date if different from invoice date (in ISO format). If not visible, assume same as invoice date and omit.
   Note: If the same material appears multiple times with different dates or prices,
   create separate line items for each occurrence.

Verification Step: If possible, after extracting all items, mentally sum their total prices. This sum should ideally be close to the overall invoice 'totalAmount'. If there's a large discrepancy, please double-check item extractions. If the invoice explicitly states a grand total that differs from the sum of items, prioritize the explicitly stated grand total for the 'totalAmount' field.

Database Schema Requirements:
- Provider must have a tax ID (\`cif\`) extracted if visible. This is a critical field. Prioritize Spanish CIF/NIF/DNI if available; otherwise, use any other official provider tax identifier found. If no Tax ID is found on the invoice, the \`cif\` field in the JSON should be null.
- Include provider email and phone if these are present on the invoice, otherwise use null.
- Invoice must have a unique invoice code and valid issue date.
- Each line item represents an InvoiceItem linked to a Material. Include materialName and materialDescription.
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
      "materialName": "string - item/material short name",
      "materialDescription": "string | null - optional item/material detailed description, null if not directly available",
      "quantity": "number - quantity with 2 decimal places",
      "unitPrice": "number - price per unit with 2 decimal places",
      "totalPrice": "number - quantity * unitPrice with 2 decimal places",
      "itemDate": "string | null - optional ISO date format if different from invoice date, null if not specified or same as invoice date"
    }
  ]
}`;

        console.log(`Calling OpenAI API for file: ${file.name} with ${imageUrls.length} page images.`);
        const response = await openai.chat.completions.create({
            model: "gpt-4.1", // Updated model
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: promptText },
                        ...imageUrls // Spread the array of image_url objects
                    ]
                }
            ],
            max_tokens: 4096,
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        if (!content) {
            console.error(`No content in OpenAI response for ${file.name}`);
            return null;
        }

        try {
            const extractedData = JSON.parse(content) as ExtractedPdfData;
            console.log(`Successfully parsed OpenAI JSON response for multi-page file: ${file.name}. Items extracted: ${extractedData.items?.length || 0}`);

            // Basic validation for crucial invoice-level fields from the consolidated response
            if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number') {
                console.warn(`Consolidated response for ${file.name} missing crucial invoice-level data. Data: ${JSON.stringify(extractedData)}`);
                // Potentially throw an error or return null if critical data is missing after consolidation by AI
                // For now, will be caught by later validation stages if this function returns it.
            }
            if (!extractedData.items || extractedData.items.length === 0) {
                console.warn(`File ${file.name} yielded invoice-level data but no line items were extracted by AI from any page.`);
            }

            return extractedData;

        } catch (parseError) {
            console.error(`Error parsing consolidated OpenAI response for ${file.name}:`, parseError);
            return null;
        }

    } catch (error) {
        console.error(`Error extracting data from PDF ${file.name}:`, error);
        if (error instanceof Error && error.message.startsWith('PDF_CONVERSION_FAILED:')) {
            throw error;
        }
        return null; // Return null for other types of top-level errors in this function
    }
}

async function findOrCreateProviderTx(tx: Prisma.TransactionClient, providerData: ExtractedPdfData['provider']): Promise<Provider> {
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
                type: "MATERIAL_SUPPLIER",
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
            }
        });
    }
    return provider;
}

async function findOrCreateMaterialTx(tx: Prisma.TransactionClient, materialName: string, materialDescription?: string, materialCode?: string): Promise<Material> {
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

    if (!material) {
        material = await tx.material.create({
            data: {
                code: materialCode || normalizedName.toLowerCase().replace(/\s+/g, '-').substring(0, 50),
                name: normalizedName,
                description: materialDescription, // Save description on creation
            },
        });
    } else {
        // Update description if it's provided and the existing material doesn't have one,
        // or if you want to always update it (be cautious with overwriting valuable data).
        if (materialDescription && (!material.description || material.description !== materialDescription)) {
            material = await tx.material.update({
                where: { id: material.id },
                data: { description: materialDescription },
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
    createdMaterial: Material
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
        },
    });

    let alert: PriceAlert | undefined;

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
                    effectiveDate, // Add the effective date to the alert
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

    return { invoiceItem, alert };
}

export async function createInvoiceFromFiles(
    formDataWithFiles: FormData
): Promise<{ overallSuccess: boolean; results: CreateInvoiceResult[] }> {
    const files = formDataWithFiles.getAll("files") as File[];
    if (!files || files.length === 0) {
        return { overallSuccess: false, results: [{ success: false, message: "No files provided.", fileName: "N/A" }] };
    }

    const extractionResults: ExtractedFileItem[] = [];

    // 1. Extract data from all files
    for (const file of files) {
        console.log(`Processing file for extraction: ${file.name}`);
        if (file.size === 0) {
            console.warn(`Skipping empty file: ${file.name}`);
            extractionResults.push({ file, extractedData: null, error: "File is empty.", fileName: file.name });
            continue;
        }
        if (file.type !== 'application/pdf') {
            console.warn(`Skipping non-PDF file: ${file.name}, type: ${file.type}`);
            extractionResults.push({ file, extractedData: null, error: "File is not a PDF.", fileName: file.name });
            continue;
        }

        try {
            // callPdfExtractAPI now returns a single ExtractedPdfData object or null
            const extractedInvoiceData = await callPdfExtractAPI(file);

            if (!extractedInvoiceData) {
                console.error(`Failed to extract any usable invoice data for file: ${file.name}.`);
                extractionResults.push({ file, extractedData: null, error: "Failed to extract usable invoice data from PDF.", fileName: file.name });
                continue;
            }

            // Validate crucial data for the entire invoice
            if (!extractedInvoiceData.invoiceCode || !extractedInvoiceData.provider?.cif || !extractedInvoiceData.issueDate || typeof extractedInvoiceData.totalAmount !== 'number') {
                console.warn(`Missing crucial invoice-level data for file: ${file.name}. Data: ${JSON.stringify(extractedInvoiceData)}`);
                extractionResults.push({
                    file,
                    extractedData: extractedInvoiceData,
                    error: "Missing or invalid crucial invoice-level data after PDF extraction. Check invoice code, provider CIF, issue date, or total amount.",
                    fileName: file.name,
                });
                continue;
            }
            if (!extractedInvoiceData.items || extractedInvoiceData.items.length === 0) {
                console.warn(`No line items extracted for file: ${file.name}. Proceeding with invoice-level data if valid.`);
                // This might be acceptable depending on business logic (invoice with no items listed but a total exists)
                // For now, we allow it to proceed to the sorting stage.
            }

            try {
                // Validate date format early for sorting
                new Date(extractedInvoiceData.issueDate); // This throws if date is invalid
                extractionResults.push({
                    file,
                    extractedData: extractedInvoiceData,
                    fileName: file.name,
                });
            } catch (dateError) {
                console.warn(`Invalid issue date format for file: ${file.name}. Date: ${extractedInvoiceData.issueDate}`);
                extractionResults.push({
                    file,
                    extractedData: extractedInvoiceData,
                    error: `Invalid issue date format: ${extractedInvoiceData.issueDate}.`,
                    fileName: file.name,
                });
            }

        } catch (extractionOrConversionError: unknown) {
            console.error(`Error during extraction or conversion for file ${file.name}:`, extractionOrConversionError);
            let errorMessage = "Failed to process PDF.";
            if (extractionOrConversionError instanceof Error) {
                if (extractionOrConversionError.message.startsWith('PDF_CONVERSION_FAILED:')) {
                    errorMessage = extractionOrConversionError.message.substring('PDF_CONVERSION_FAILED: '.length);
                } else {
                    errorMessage = extractionOrConversionError.message;
                }
            }
            extractionResults.push({ file, extractedData: null, error: errorMessage, fileName: file.name });
        }
    }

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
                    const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialDescription);
                    const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;
                    const currentItemUnitPrice = new Prisma.Decimal(itemData.unitPrice.toFixed(2));

                    // 1. Check for intra-invoice price changes
                    const lastSeenPriceRecordInThisInvoice = intraInvoiceMaterialPriceHistory.get(material.id);

                    if (lastSeenPriceRecordInThisInvoice) {
                        // Compare if current item is not effectively older and price has changed
                        // Only trigger if the current item's date is same or newer, and price is different
                        if (effectiveItemDate.getTime() >= lastSeenPriceRecordInThisInvoice.date.getTime() &&
                            !currentItemUnitPrice.equals(lastSeenPriceRecordInThisInvoice.price)) {

                            const priceDiff = currentItemUnitPrice.minus(lastSeenPriceRecordInThisInvoice.price);
                            let percentageChangeDecimal: Prisma.Decimal;
                            if (!lastSeenPriceRecordInThisInvoice.price.isZero()) {
                                percentageChangeDecimal = priceDiff.dividedBy(lastSeenPriceRecordInThisInvoice.price).times(100);
                            } else {
                                percentageChangeDecimal = new Prisma.Decimal(currentItemUnitPrice.isPositive() ? 9999 : -9999); // Represent large change if old price was zero
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
                                    // Optionally, link to the previous invoice item ID in this invoice if schema allows
                                    // previousInvoiceItemId: lastSeenPriceRecordInThisInvoice.invoiceItemId 
                                },
                            });
                            alertsCounter++;
                            console.log(`[Invoice ${invoice.invoiceCode}][Material '${material.name}'] INTRA-INVOICE Price alert created. Old (from item ${lastSeenPriceRecordInThisInvoice.invoiceItemId} in this invoice): ${lastSeenPriceRecordInThisInvoice.price}, New (current item): ${currentItemUnitPrice}, Change: ${percentageChangeDecimal.toFixed(2)}%, Effective Date: ${effectiveItemDate.toISOString()}`);
                        }
                    }

                    // 2. Process the item (creates InvoiceItem and handles INTER-invoice alerts)
                    // processInvoiceItemTx compares against items from *other* invoices or items with *strictly earlier dates*
                    const { invoiceItem, alert: interInvoiceAlert } = await processInvoiceItemTx(
                        tx,
                        itemData,
                        invoice.id,
                        currentInvoiceIssueDate, // Pass original invoice issue date for context if needed by processInvoiceItemTx
                        provider.id,
                        material
                    );

                    if (interInvoiceAlert) {
                        alertsCounter++; // Count inter-invoice alert
                    }

                    // 3. Update/set price history for this material WITHIN THIS INVOICE using the created invoiceItem's details
                    // This ensures subsequent items in *this same invoice* compare against the latest processed item.
                    // Only update if the current item is newer or has the same date but potentially a different price (already handled by intra-invoice check).
                    // We always update to reflect the price of the item just processed for the next iteration within this invoice.
                    intraInvoiceMaterialPriceHistory.set(material.id, {
                        price: invoiceItem.unitPrice, // Use the actual price stored in the DB for the item
                        date: invoiceItem.itemDate,   // Use the actual date stored for the item
                        invoiceItemId: invoiceItem.id
                    });
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