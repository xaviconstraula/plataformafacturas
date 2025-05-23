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
    pageNumber?: number; // Optional page number
}

// Type for the result of the transaction part of processing
interface TransactionOperationResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    isExisting?: boolean; // To distinguish from new invoices
}

async function callPdfExtractAPI(file: File): Promise<ExtractedPdfData[]> {
    try {
        console.log(`Starting PDF extraction for file: ${file.name}`);
        // Convert the File to ArrayBuffer
        const buffer = Buffer.from(await file.arrayBuffer());
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

        // Convert PDF to PNG - now processing all pages
        let pages;
        try {
            pages = await pdfToPng(arrayBuffer, {
                disableFontFace: true, // TRYING THIS: Ignore embedded fonts
                useSystemFonts: true,   // Allow system font fallback
                viewportScale: 2.0,     // Higher quality for better OCR
                verbosityLevel: 0,      // Only show errors
                strictPagesToProcess: false, // Allow all pages
            });
        } catch (conversionError: unknown) {
            console.error(`Error during pdfToPng conversion for ${file.name}:`, conversionError);
            // Return a special structure or throw a custom error that can be caught by the caller
            // to indicate this specific failure. For now, returning an empty array
            // but marking it with a property or specific error type would be better.
            // For the purpose of this edit, we'll have the caller (createInvoiceFromFiles)
            // check for an empty array AND the absence of pages to infer this.
            // A more robust solution would be a custom error or a result object.
            // This is a simplified way to signal the error back to the ExtractedFileItem
            // The calling function `createInvoiceFromFiles` will need to be aware of this.
            // We will have `createInvoiceFromFiles` create an ExtractedFileItem with a specific error.
            // To make this function directly signal the error, we can throw it.
            if (typeof conversionError === 'object' && conversionError !== null && 'code' in conversionError && (conversionError as { code: unknown }).code === 'InvalidArg' && 'message' in conversionError && typeof (conversionError as { message: unknown }).message === 'string' && (conversionError as { message: string }).message.includes('Convert String to CString failed')) {
                throw new Error(`PDF_CONVERSION_FAILED: ${file.name} could not be converted due to internal font/text encoding issues. Details: ${(conversionError as { message: string }).message}`);
            }
            throw conversionError; // Re-throw other errors
        }

        if (!pages || pages.length === 0) {
            console.error(`Failed to convert PDF to images for ${file.name}`);
            return [];
        }
        console.log(`Successfully converted PDF to ${pages.length} images for ${file.name}`);

        const extractedInvoices: ExtractedPdfData[] = [];

        // Process each page
        for (const page of pages) {
            if (!page?.content) {
                console.warn(`Skipping page in ${file.name} due to missing content`);
                continue;
            }

            // Convert the PNG buffer to base64
            const base64Image = `data:image/png;base64,${page.content.toString("base64")}`;

            const prompt = 'Analyze this invoice image and extract the following information in a structured way:\n' +
                '1. Provider Information (invoice issuer):\n' +
                '   - Company name\n' +
                '   - Provider Tax ID: Extract any official tax identification number found (e.g., VAT ID, Company Registration Number, etc.).\n' +
                '     If a Spanish CIF/NIF/DNI is present, ensure it matches these formats:\n' +
                '       * CIF: Letter + 8 digits (e.g., B12345678)\n' +
                '       * NIF: 8 digits + letter (e.g., 12345678A)\n' +
                '       * DNI: 8 digits + letter (e.g., 12345678Z)\n' +
                '     If no Spanish-formatted ID is found, provide the most relevant tax identifier present on the invoice for the `cif` field.\n' +
                '   - Provider email: Extract the provider\'s primary email address if available.\n' +
                '   - Provider phone: Extract the provider\'s primary phone number if available.\n' +
                '2. Invoice Details:\n' +
                '   - Unique invoice code\n' +
                '   - Issue date (must be a valid date)\n' +
                '   - Total amount (must be a decimal number with 2 decimal places)\n' +
                '3. Line Items (IMPORTANT: Extract ALL items that appear on the invoice):\n' +
                '   For each distinct item and date combination:\n' +
                '   - Material name/short identifier (extract exactly as shown on invoice)\n' +
                '   - Material description (generate a brief description of the item)\n' +
                '   - Quantity (must be a decimal number with 2 decimal places)\n' +
                '   - Unit price (must be a decimal number with 2 decimal places)\n' +
                '   - Total price per item (must be quantity * unit price)\n' +
                '   - Item date if different from invoice date (in ISO format)\n' +
                '   Note: If the same material appears multiple times with different dates or prices,\n' +
                '   create separate line items for each occurrence.\n\n' +
                'Database Schema Requirements:\n' +
                '- Provider must have a tax ID (`cif`) extracted. This is a critical field. Prioritize Spanish CIF/NIF/DNI if available; otherwise, use any other official provider tax identifier found.\n' +
                '- Include provider email and phone if these are present on the invoice.\n' +
                '- Invoice must have a unique invoice code and valid issue date\n' +
                '- Each line item represents an InvoiceItem linked to a Material. Include materialName and materialDescription.\n' +
                '- All monetary values must be Decimal(10,2)\n' +
                '- All quantities must be Decimal(10,2)\n\n' +
                'Format the response as valid JSON exactly like this:\n' +
                '{\n' +
                '  "invoiceCode": "string - unique invoice identifier",\n' +
                '  "provider": {\n' +
                '    "name": "string - company name",\n' +
                '    "cif": "string - provider tax ID (any official format, Spanish CIF/NIF/DNI preferred if available)",\n' +
                '    "email": "string? - optional provider email extracted from invoice",\n' +
                '    "phone": "string? - optional provider phone extracted from invoice",\n' +
                '    "address": "string? - optional address"\n' +
                '  },\n' +
                '  "issueDate": "string - ISO date format",\n' +
                '  "totalAmount": "number - total invoice amount with 2 decimal places",\n' +
                '  "items": [\n' +
                '    {\n' +
                '      "materialName": "string - item/material short name",\n' +
                '      "materialDescription": "string? - optional item/material detailed description",\n' +
                '      "quantity": "number - quantity with 2 decimal places",\n' +
                '      "unitPrice": "number - price per unit with 2 decimal places",\n' +
                '      "totalPrice": "number - quantity * unitPrice with 2 decimal places",\n' +
                '      "itemDate": "string? - optional ISO date format if different from invoice date"\n' +
                '    }\n' +
                '  ]\n' +
                '}';

            console.log(`Calling OpenAI API for file: ${file.name}, page ${pages.indexOf(page) + 1}`);
            const response = await openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image,
                                    detail: "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 4096,
                response_format: { type: "json_object" },
            });

            const content = response.choices[0].message.content;
            if (!content) {
                console.error(`No content in OpenAI response for ${file.name}, page ${pages.indexOf(page) + 1}`);
                continue;
            }

            try {
                // Parse the JSON response
                const parsedContent = JSON.parse(content) as ExtractedPdfData;
                console.log(`Successfully parsed OpenAI JSON response for ${file.name}, page ${pages.indexOf(page) + 1}`);

                // Validate required fields
                if (parsedContent.invoiceCode &&
                    parsedContent.provider?.cif &&
                    parsedContent.issueDate &&
                    typeof parsedContent.totalAmount === 'number' &&
                    parsedContent.items?.length) {
                    extractedInvoices.push(parsedContent);
                } else {
                    console.warn(`Skipping page ${pages.indexOf(page) + 1} in ${file.name} due to missing required fields`);
                }
            } catch (parseError) {
                console.error(`Error parsing OpenAI response for ${file.name}, page ${pages.indexOf(page) + 1}:`, parseError);
                continue;
            }
        }

        return extractedInvoices;

    } catch (error) {
        console.error(`Error extracting data from PDF ${file.name}:`, error);
        // If the error is one we've specifically thrown from the conversion step
        if (error instanceof Error && error.message.startsWith('PDF_CONVERSION_FAILED:')) {
            throw error; // Re-throw to be caught by createInvoiceFromFiles
        }
        return [];
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
            const extractedDataArray = await callPdfExtractAPI(file);

            if (!extractedDataArray || extractedDataArray.length === 0) {
                // This case might still occur if callPdfExtractAPI returns [] for reasons other than conversion failure
                // (e.g., no content after conversion, or OpenAI returns nothing).
                console.error(`Failed to extract any invoice data for file: ${file.name} (post-conversion).`);
                extractionResults.push({ file, extractedData: null, error: "Failed to extract any invoice data from PDF after conversion.", fileName: file.name });
                continue;
            }

            // Process each invoice from the PDF
            extractedDataArray.forEach((data, pageIndex) => {
                if (!data.invoiceCode || !data.provider?.cif || !data.issueDate || typeof data.totalAmount !== 'number' || !data.items?.length) {
                    console.warn(`Missing crucial data for file: ${file.name}, page ${pageIndex + 1}. Data: ${JSON.stringify(data)}`);
                    extractionResults.push({
                        file,
                        extractedData: data,
                        error: "Missing or invalid crucial data after PDF extraction. Check invoice code, provider CIF, issue date, total amount, or items.",
                        fileName: file.name,
                        pageNumber: pageIndex + 1
                    });
                    return;
                }
                try {
                    // Validate date format early for sorting
                    new Date(data.issueDate);
                    extractionResults.push({
                        file,
                        extractedData: data,
                        fileName: file.name,
                        pageNumber: pageIndex + 1
                    });
                } catch (dateError) {
                    console.warn(`Invalid issue date format for file: ${file.name}, page ${pageIndex + 1}. Date: ${data.issueDate}`);
                    extractionResults.push({
                        file,
                        extractedData: data,
                        error: `Invalid issue date format: ${data.issueDate}.`,
                        fileName: file.name,
                        pageNumber: pageIndex + 1
                    });
                }
            });
        } catch (extractionOrConversionError: unknown) {
            console.error(`Error during extraction or conversion for file ${file.name}:`, extractionOrConversionError);
            let errorMessage = "Failed to process PDF.";
            if (extractionOrConversionError instanceof Error) {
                if (extractionOrConversionError.message.startsWith('PDF_CONVERSION_FAILED:')) {
                    // Use the specific message from the thrown error
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
                fileName: `${item.fileName}${item.pageNumber ? ` (Page ${item.pageNumber})` : ''}`
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
        page: p.pageNumber,
        date: p.extractedData?.issueDate
    })));

    // 4. Process sorted items sequentially
    for (const item of processableItems) {
        const { file, extractedData, fileName, pageNumber } = item;
        if (!extractedData) continue;

        try {
            console.log(`Starting database transaction for sorted invoice from file: ${fileName}${pageNumber ? `, page ${pageNumber}` : ''}, invoice code: ${extractedData.invoiceCode}, issue date: ${extractedData.issueDate}`);
            const operationResult: TransactionOperationResult = await prisma.$transaction(async (tx) => {
                const provider = await findOrCreateProviderTx(tx, extractedData.provider);

                const existingInvoice = await tx.invoice.findFirst({
                    where: {
                        invoiceCode: extractedData.invoiceCode,
                        providerId: provider.id
                    }
                });

                if (existingInvoice) {
                    console.log(`Invoice ${extractedData.invoiceCode} from provider ${provider.name} (file: ${fileName}${pageNumber ? `, page ${pageNumber}` : ''}) already exists. Skipping creation.`);
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

                for (const itemData of extractedData.items) {
                    if (!itemData.materialName) {
                        console.warn(`Skipping item due to missing material name in invoice ${invoice.invoiceCode} from file ${fileName}${pageNumber ? `, page ${pageNumber}` : ''}`);
                        continue;
                    }
                    const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialDescription);
                    const { alert } = await processInvoiceItemTx(tx, itemData, invoice.id, currentInvoiceIssueDate, provider.id, material);
                    if (alert) {
                        alertsCounter++;
                    }
                }
                console.log(`Successfully created invoice ${invoice.invoiceCode} from file: ${fileName}${pageNumber ? `, page ${pageNumber}` : ''}. Alerts created: ${alertsCounter}`);
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
                    fileName: `${fileName}${pageNumber ? ` (Page ${pageNumber})` : ''}`
                });
            } else {
                finalResults.push({
                    success: operationResult.success,
                    message: operationResult.message,
                    invoiceId: operationResult.invoiceId,
                    alertsCreated: operationResult.alertsCreated,
                    fileName: `${fileName}${pageNumber ? ` (Page ${pageNumber})` : ''}`
                });
            }
        } catch (error) {
            console.error(`Error processing sorted invoice from ${fileName}${pageNumber ? `, page ${pageNumber}` : ''}:`, error);
            const baseMessage = `Failed to create invoice from ${fileName}${pageNumber ? ` (Page ${pageNumber})` : ''}`;
            let specificMessage = "An unexpected error occurred.";

            if (error instanceof Error) {
                specificMessage = error.message;
            }

            const isPrismaP2002Error = (e: unknown): e is { code: string; meta?: { target?: string[] } } => {
                return typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';
            };

            if (isPrismaP2002Error(error)) {
                if (error.meta && error.meta.target && error.meta.target.includes('invoiceCode') && extractedData) {
                    console.warn(`Duplicate invoice code '${extractedData.invoiceCode}' for file: ${fileName}${pageNumber ? `, page ${pageNumber}` : ''}`);
                    specificMessage = `An invoice with code '${extractedData.invoiceCode}' already exists.`;
                }
            }
            finalResults.push({ success: false, message: `${baseMessage}: ${specificMessage}`, fileName: `${fileName}${pageNumber ? ` (Page ${pageNumber})` : ''}` });
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