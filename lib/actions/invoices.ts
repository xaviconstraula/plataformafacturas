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

const PRICE_INCREASE_THRESHOLD_PERCENTAGE = new Prisma.Decimal(10); // Alert if price increases by 10% or more

export interface CreateInvoiceResult {
    success: boolean;
    message: string;
    invoiceId?: string;
    alertsCreated?: number;
    fileName?: string;
}

async function callPdfExtractAPI(file: File): Promise<ExtractedPdfData | null> {
    try {
        console.log(`Starting PDF extraction for file: ${file.name}`);
        // Convert the File to ArrayBuffer
        const buffer = Buffer.from(await file.arrayBuffer());
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

        // Convert PDF to PNG
        const [page] = await pdfToPng(arrayBuffer, {
            disableFontFace: false, // Enable better font rendering
            useSystemFonts: true,   // Allow system font fallback
            viewportScale: 2.0,     // Higher quality for better OCR
            verbosityLevel: 0,      // Only show errors
            pagesToProcess: [1],    // Only first page
            strictPagesToProcess: true, // Fail if page is invalid
        });

        if (!page?.content) {
            console.error(`Failed to convert PDF to image for ${file.name}`);
            return null;
        }
        console.log(`Successfully converted PDF to image for ${file.name}`);

        // Convert the PNG buffer to base64
        const base64Image = `data:image/png;base64,${page.content.toString("base64")}`;

        const prompt = 'Analyze this invoice image and extract the following information in a structured way:\n' +
            '1. Provider Information (invoice issuer):\n' +
            '   - Company name\n' +
            '   - Tax ID (CIF/NIF/DNI) following Spanish format:\n' +
            '     * CIF: Letter + 8 digits (e.g. B12345678)\n' +
            '     * NIF: 8 digits + letter (e.g. 12345678A)\n' +
            '     * DNI: 8 digits + letter (e.g. 12345678Z)\n' +
            '   - Provider contact details if available (email, phone, address)\n' +
            '2. Invoice Details:\n' +
            '   - Unique invoice code\n' +
            '   - Issue date (must be a valid date)\n' +
            '   - Total amount (must be a decimal number with 2 decimal places)\n' +
            '3. Line Items (for each item):\n' +
            '   - Material name/short identifier\n' +
            '   - Material description (a more detailed description of the item, if available)\n' +
            '   - Quantity (must be a decimal number with 2 decimal places)\n' +
            '   - Unit price (must be a decimal number with 2 decimal places)\n' +
            '   - Total price per item (must be quantity * unit price)\n\n' +
            'Database Schema Requirements:\n' +
            '- Provider must have a valid tax ID (CIF/NIF/DNI) as it links to the Provider table. Include email and phone if present on the invoice.\n' +
            '- Invoice must have a unique invoice code and valid issue date\n' +
            '- Each line item represents an InvoiceItem linked to a Material. Include materialName and materialDescription.\n' +
            '- All monetary values must be Decimal(10,2)\n' +
            '- All quantities must be Decimal(10,2)\n\n' +
            'Format the response as valid JSON exactly like this:\n' +
            '{\n' +
            '  "invoiceCode": "string - unique invoice identifier",\n' +
            '  "provider": {\n' +
            '    "name": "string - company name",\n' +
            '    "cif": "string - tax ID (CIF/NIF/DNI)",\n' +
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
            '      "totalPrice": "number - quantity * unitPrice with 2 decimal places"\n' +
            '    }\n' +
            '  ]\n' +
            '}';

        console.log(`Calling OpenAI API for file: ${file.name}`);
        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini", // Consider making model configurable if needed
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: base64Image,
                                detail: "high" // Consider "auto" or "low" for cost/speed tradeoffs
                            }
                        }
                    ]
                }
            ],
            max_tokens: 4096, // Adjust if necessary
            response_format: { type: "json_object" }, // Enforce JSON output
        });

        const content = response.choices[0].message.content;
        if (!content) {
            console.error(`No content in OpenAI response for ${file.name}`);
            return null;
        }
        console.log(`Successfully received OpenAI API response for ${file.name}`);

        // Parse the JSON response
        const parsedContent = JSON.parse(content) as ExtractedPdfData;
        console.log(`Successfully parsed OpenAI JSON response for ${file.name}`);
        return parsedContent;

    } catch (error) {
        console.error(`Error extracting data from PDF ${file.name}:`, error);
        // Optionally, include more details from the error object if it's an OpenAI specific error
        // e.g., if (error instanceof OpenAI.APIError) { ... }
        return null;
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
    providerId: string,
    createdMaterial: Material
): Promise<{ invoiceItem: InvoiceItem; alert?: PriceAlert }> {
    const { quantity, unitPrice, totalPrice } = itemData;

    if (typeof quantity !== 'number' || isNaN(quantity) ||
        typeof unitPrice !== 'number' || isNaN(unitPrice) ||
        typeof totalPrice !== 'number' || isNaN(totalPrice)) {
        throw new Error(`Invalid item data: quantity=${quantity}, unitPrice=${unitPrice}, totalPrice=${totalPrice}`);
    }

    const quantityDecimal = new Prisma.Decimal(quantity.toFixed(2));
    const unitPriceDecimal = new Prisma.Decimal(unitPrice.toFixed(2));
    const totalPriceDecimal = new Prisma.Decimal(totalPrice.toFixed(2));

    const invoiceItem = await tx.invoiceItem.create({
        data: {
            invoiceId,
            materialId: createdMaterial.id,
            quantity: quantityDecimal,
            unitPrice: unitPriceDecimal,
            totalPrice: totalPriceDecimal,
        },
    });

    let alert: PriceAlert | undefined;
    const materialProvider = await tx.materialProvider.findUnique({
        where: {
            materialId_providerId: {
                materialId: createdMaterial.id,
                providerId,
            },
        },
    });

    if (materialProvider) {
        const lastPriceDecimal = materialProvider.lastPrice;
        if (unitPriceDecimal.greaterThan(lastPriceDecimal)) {
            const priceDiff = unitPriceDecimal.minus(lastPriceDecimal);
            if (!lastPriceDecimal.isZero()) {
                const percentageIncreaseDecimal = priceDiff.dividedBy(lastPriceDecimal).times(100);
                if (percentageIncreaseDecimal.gte(PRICE_INCREASE_THRESHOLD_PERCENTAGE)) {
                    alert = await tx.priceAlert.create({
                        data: {
                            materialId: createdMaterial.id,
                            providerId,
                            oldPrice: lastPriceDecimal,
                            newPrice: unitPriceDecimal,
                            percentage: percentageIncreaseDecimal,
                            status: "PENDING",
                        },
                    });
                }
            } else if (unitPriceDecimal.greaterThan(0)) {
                alert = await tx.priceAlert.create({
                    data: {
                        materialId: createdMaterial.id,
                        providerId,
                        oldPrice: lastPriceDecimal,
                        newPrice: unitPriceDecimal,
                        percentage: new Prisma.Decimal(9999),
                        status: "PENDING",
                    },
                });
            }
        }
        if (!materialProvider.lastPrice.equals(unitPriceDecimal)) {
            await tx.materialProvider.update({
                where: { id: materialProvider.id },
                data: { lastPrice: unitPriceDecimal },
            });
        }
    } else {
        await tx.materialProvider.create({
            data: {
                materialId: createdMaterial.id,
                providerId,
                lastPrice: unitPriceDecimal,
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

    const results: CreateInvoiceResult[] = [];
    let overallSuccess = true;

    for (const file of files) {
        console.log(`Processing file: ${file.name}`);
        if (file.size === 0) {
            results.push({ success: false, message: "File is empty.", fileName: file.name });
            overallSuccess = false;
            console.warn(`Skipping empty file: ${file.name}`);
            continue;
        }
        if (file.type !== 'application/pdf') {
            results.push({ success: false, message: "File is not a PDF.", fileName: file.name });
            overallSuccess = false;
            console.warn(`Skipping non-PDF file: ${file.name}, type: ${file.type}`);
            continue;
        }

        const extractedData = await callPdfExtractAPI(file);

        if (!extractedData) {
            results.push({ success: false, message: "Failed to extract data from PDF.", fileName: file.name });
            overallSuccess = false;
            console.error(`Failed to extract data for file: ${file.name}`);
            continue;
        }

        if (!extractedData.invoiceCode || !extractedData.provider?.cif || !extractedData.issueDate || typeof extractedData.totalAmount !== 'number' || !extractedData.items?.length) {
            results.push({ success: false, message: "Missing or invalid crucial data after PDF extraction. Check invoice code, provider CIF, issue date, total amount, or items.", fileName: file.name });
            overallSuccess = false;
            console.warn(`Missing crucial data for file: ${file.name}. Data: ${JSON.stringify(extractedData)}`);
            continue;
        }

        try {
            console.log(`Starting database transaction for invoice from file: ${file.name}, invoice code: ${extractedData.invoiceCode}`);
            const operationResult = await prisma.$transaction(async (tx) => {
                const provider = await findOrCreateProviderTx(tx, extractedData.provider);

                const existingInvoice = await tx.invoice.findFirst({
                    where: {
                        invoiceCode: extractedData.invoiceCode,
                        providerId: provider.id
                    }
                });

                if (existingInvoice) {
                    console.log(`Invoice ${extractedData.invoiceCode} from provider ${provider.name} already exists. Skipping creation for file: ${file.name}`);
                    return { success: true, message: `Invoice ${extractedData.invoiceCode} from provider ${provider.name} already exists.`, invoiceId: existingInvoice.id, alertsCreated: 0, isExisting: true };
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
                for (const itemData of extractedData.items) {
                    if (!itemData.materialName) {
                        console.warn(`Skipping item due to missing material name in invoice ${invoice.invoiceCode} from file ${file.name}`);
                        continue;
                    }
                    const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialDescription);
                    const { alert } = await processInvoiceItemTx(tx, itemData, invoice.id, provider.id, material);
                    if (alert) {
                        alertsCounter++;
                    }
                }
                console.log(`Successfully created invoice ${invoice.invoiceCode} from file: ${file.name}. Alerts created: ${alertsCounter}`);
                return { success: true, message: `Invoice ${invoice.invoiceCode} created successfully.`, invoiceId: invoice.id, alertsCreated: alertsCounter, isExisting: false };
            });

            if (operationResult.isExisting) {
                results.push({ success: true, message: operationResult.message, invoiceId: operationResult.invoiceId, fileName: file.name });
            } else {
                results.push({ success: operationResult.success, message: operationResult.message, invoiceId: operationResult.invoiceId, alertsCreated: operationResult.alertsCreated, fileName: file.name });
                if (!operationResult.success) overallSuccess = false;
            }

        } catch (error: unknown) {
            console.error(`Error processing invoice from ${file.name}:`, error);
            const baseMessage = `Failed to create invoice from ${file.name}`;
            let specificMessage = "An unexpected error occurred.";

            if (error instanceof Error) {
                specificMessage = error.message;
            }

            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
                const meta = (error as { meta?: { target?: string[] } }).meta;
                if (meta && meta.target && meta.target.includes('invoiceCode') && extractedData) {
                    results.push({ success: false, message: `${baseMessage}: An invoice with code '${extractedData.invoiceCode}' already exists.`, fileName: file.name });
                    console.warn(`Duplicate invoice code '${extractedData.invoiceCode}' for file: ${file.name}`);
                } else {
                    results.push({ success: false, message: `${baseMessage}: ${specificMessage}`, fileName: file.name });
                }
            } else {
                results.push({ success: false, message: `${baseMessage}: ${specificMessage}`, fileName: file.name });
            }
            overallSuccess = false;
        }
    }

    const newlyCreatedInvoices = results.filter(r => r.success && r.invoiceId && !r.message.includes("already exists"));
    if (newlyCreatedInvoices.length > 0) {
        revalidatePath("/facturas");
        console.log("Revalidated /facturas path.");
        if (newlyCreatedInvoices.some(r => r.alertsCreated && r.alertsCreated > 0)) {
            revalidatePath("/alertas");
            console.log("Revalidated /alertas path due to new alerts.");
        }
    }

    return { overallSuccess, results };
} 