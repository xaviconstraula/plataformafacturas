'use server'

import { prisma } from "@/lib/db";
import { type ExtractedPdfData, type ExtractedPdfItemData } from "@/lib/types/pdf";
import { Prisma, type Provider, type Material, type Invoice, type InvoiceItem, type PriceAlert, type MaterialProvider } from "@/generated/prisma";
import { revalidatePath } from "next/cache";
import { pdfToPng } from "pdf-to-png-converter";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import { extractMaterialCode, normalizeMaterialCode, areMaterialCodesSimilar, generateStandardMaterialCode, areMaterialNamesSimilar } from "@/lib/utils";

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

// Interface for extracted text data
interface ExtractedTextData {
    rawText: string;
    cifNumbers: string[];
    phoneNumbers: string[];
}

// Regex patterns for Spanish identification numbers and phones
const CIF_REGEX = /\b[A-Z]\d{8}\b/g; // CIF: Letter + 8 digits
const NIF_REGEX = /\b\d{8}[A-Z]\b/g; // NIF: 8 digits + letter
const NIE_REGEX = /\b[XYZ]\d{7}[A-Z]\b/g; // NIE: X/Y/Z + 7 digits + letter
const PHONE_REGEX = /\b(?:\+34\s?)?(?:6|7|8|9)\d{8}\b/g; // Spanish phone numbers

// Helper function to parse OpenAI's rate limit reset time string (e.g., "60s", "200ms")
function parseOpenAIResetTime(timeStr: string | null | undefined): number {
    if (!timeStr) return 60000; // Default to 1 minute if unknown

    // Quick path for common patterns
    if (timeStr === '60s') return 60000;
    if (timeStr === '30s') return 30000;
    if (timeStr === '1m') return 60000;

    let totalMilliseconds = 0;

    // Parse milliseconds
    const msMatch = timeStr.match(/(\d+)ms/);
    if (msMatch) {
        totalMilliseconds += parseInt(msMatch[1], 10);
    }

    // Parse seconds
    const sMatch = timeStr.match(/(\d+)s/);
    if (sMatch) {
        totalMilliseconds += parseInt(sMatch[1], 10) * 1000;
    }

    // Parse minutes
    const mMatch = timeStr.match(/(\d+)m/);
    if (mMatch) {
        totalMilliseconds += parseInt(mMatch[1], 10) * 60 * 1000;
    }

    // Parse hours (in case of very long resets)
    const hMatch = timeStr.match(/(\d+)h/);
    if (hMatch) {
        totalMilliseconds += parseInt(hMatch[1], 10) * 60 * 60 * 1000;
    }

    // If only a number is provided, treat as seconds
    if (totalMilliseconds === 0 && /^\d+$/.test(timeStr)) {
        return Math.min(parseInt(timeStr, 10) * 1000, 300000); // Cap at 5 minutes
    }

    // Return parsed time or sensible fallback
    return totalMilliseconds > 0 ? Math.min(totalMilliseconds, 300000) : 60000; // Cap at 5 minutes
}

// Function to extract text from PDF and find CIF/phone patterns
async function extractTextFromPdf(file: File): Promise<ExtractedTextData> {
    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        const rawText = pdfData.text;

        // Extract all potential CIF/NIF/NIE numbers
        const cifMatches = [...rawText.matchAll(CIF_REGEX)].map(match => match[0]);
        const nifMatches = [...rawText.matchAll(NIF_REGEX)].map(match => match[0]);
        const nieMatches = [...rawText.matchAll(NIE_REGEX)].map(match => match[0]);

        // Combine all identification numbers
        const cifNumbers = [...new Set([...cifMatches, ...nifMatches, ...nieMatches])];

        // Extract phone numbers
        const phoneMatches = [...rawText.matchAll(PHONE_REGEX)].map(match =>
            match[0].replace(/\s/g, '').replace(/^\+34/, '') // Normalize phone numbers
        );
        const phoneNumbers = [...new Set(phoneMatches)];

        console.log(`Text extraction from ${file.name}: Found ${cifNumbers.length} CIF/NIF/NIE numbers and ${phoneNumbers.length} phone numbers`);

        return {
            rawText,
            cifNumbers,
            phoneNumbers
        };
    } catch (error) {
        console.error(`Error extracting text from PDF ${file.name}:`, error);
        return {
            rawText: '',
            cifNumbers: [],
            phoneNumbers: []
        };
    }
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

// Enhanced function to validate and correct extracted data using text extraction
function validateAndCorrectExtractedData(
    extractedData: ExtractedPdfData,
    textData: ExtractedTextData,
    fileName: string
): ExtractedPdfData {
    const correctedData = { ...extractedData };
    let hasCorrections = false;

    // Validate and correct CIF
    if (extractedData.provider.cif) {
        const extractedCif = extractedData.provider.cif;

        // Check if the extracted CIF exists in our text-based findings
        const matchingCif = textData.cifNumbers.find(cif =>
            cif === extractedCif ||
            cif.includes(extractedCif) ||
            extractedCif.includes(cif)
        );

        if (!matchingCif && textData.cifNumbers.length > 0) {
            // AI CIF doesn't match text extraction, use the first valid one from text
            console.warn(`[${fileName}] AI extracted CIF '${extractedCif}' not found in text. Using text-extracted CIF '${textData.cifNumbers[0]}' instead.`);
            correctedData.provider.cif = textData.cifNumbers[0];
            hasCorrections = true;
        } else if (matchingCif && matchingCif !== extractedCif) {
            // Found a better match in text extraction
            console.warn(`[${fileName}] Correcting AI extracted CIF '${extractedCif}' to text-extracted '${matchingCif}'.`);
            correctedData.provider.cif = matchingCif;
            hasCorrections = true;
        }
    } else if (textData.cifNumbers.length > 0) {
        // AI didn't extract CIF but we found one in text
        console.warn(`[${fileName}] AI failed to extract CIF. Using text-extracted CIF '${textData.cifNumbers[0]}'.`);
        correctedData.provider.cif = textData.cifNumbers[0];
        hasCorrections = true;
    }

    // Validate and correct phone number
    if (!extractedData.provider.phone && textData.phoneNumbers.length > 0) {
        console.warn(`[${fileName}] AI failed to extract phone. Using text-extracted phone '${textData.phoneNumbers[0]}'.`);
        correctedData.provider.phone = textData.phoneNumbers[0];
        hasCorrections = true;
    }

    if (hasCorrections) {
        console.log(`[${fileName}] Applied corrections to extracted data. CIF: ${correctedData.provider.cif}, Phone: ${correctedData.provider.phone}`);
    }

    return correctedData;
}

async function callPdfExtractAPI(file: File): Promise<CallPdfExtractAPIResponse> {
    try {
        console.log(`Starting PDF extraction for file: ${file.name}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

        // First, extract text data for validation
        const textData = await extractTextFromPdf(file);

        let pages;
        try {
            pages = await pdfToPng(arrayBuffer, {
                disableFontFace: true,
                useSystemFonts: false,
                viewportScale: 2.0,
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

        // Enhanced prompt with better CIF and phone extraction instructions
        const potentialCifs = textData.cifNumbers.length > 0 ? `\n\nPOTENTIAL CIF/NIF/NIE FOUND IN TEXT: ${textData.cifNumbers.join(', ')}` : '';
        const potentialPhones = textData.phoneNumbers.length > 0 ? `\nPOTENTIAL PHONES FOUND IN TEXT: ${textData.phoneNumbers.join(', ')}` : '';

        const promptText = `Extract invoice data from these images (consolidate all pages into a single invoice). Only extract visible data, use null for missing optional fields.

CRITICAL NUMBER ACCURACY: 
- Distinguish 5 vs S (flat top vs curved), 8 vs B (complete vs open), 0 vs O vs 6 (oval vs round vs curved)
- Double-check all digit sequences, especially CIF/NIF numbers
- Verify quantities and codes character by character

PROVIDER (Invoice Issuer - NOT the client):
- Find company at TOP of invoice, labeled "Vendedor/Proveedor/Emisor"
- Extract: name, tax ID, email, phone, address

TAX ID (CIF/NIF/NIE) - EXTREMELY IMPORTANT:
- CIF format: Letter + exactly 8 digits (e.g., A12345678)
- NIF format: exactly 8 digits + Letter (e.g., 12345678A) 
- NIE format: X/Y/Z + exactly 7 digits + Letter (e.g., X1234567A)
- Look for labels: "CIF:", "NIF:", "Cód. Fiscal:", "Tax ID:", "RFC:"
- VERIFY digit count is correct (8 for CIF/NIF, 7 for NIE)${potentialCifs}

PHONE NUMBER:
- Spanish format: 6/7/8/9 + 8 more digits (9 total)
- May have +34 country code
- Look for labels: "Tel:", "Teléfono:", "Phone:"${potentialPhones}

INVOICE: Extract code, issue date (ISO), total amount

LINE ITEMS (extract ALL items from all pages and make sure it's actually a material, not "Albarán" or similar)
- materialName: Use descriptive name.
- materialCode: Extract the product reference code ONLY IF it is clearly visible and directly associated with the material name in a column like "Código", "Ref.", "Artículo", or "Referencia". It is often an alphanumeric string. If no such code is clearly present for an item, this field MUST BE NULL. Do not invent or guess a code.
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
    "materialCode": "string|null",
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
            let extractedData = JSON.parse(content) as ExtractedPdfData;
            console.log(`Successfully parsed OpenAI JSON response for multi-page file: ${file.name}. Items extracted: ${extractedData.items?.length || 0}`);

            // Validate and correct the extracted data using text extraction
            extractedData = validateAndCorrectExtractedData(extractedData, textData, file.name);

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

    try {
        // First, try to find existing provider by CIF
        let provider = await tx.provider.findUnique({
            where: { cif },
        });

        if (provider) {
            console.log(`Found existing provider by CIF ${cif}: ${provider.name}`);
            // Update existing provider with the most recent data
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
            return provider;
        }

        // If not found by CIF, check by phone number (duplicate detection)
        if (phone) {
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

        // Check by similar name (new feature)
        const providersWithSimilarNames = await tx.provider.findMany({
            select: { id: true, name: true, cif: true, phone: true, email: true, address: true, type: true }
        });

        for (const existingProvider of providersWithSimilarNames) {
            if (areProviderNamesSimilar(name, existingProvider.name)) {
                console.warn(`Found provider with similar name: "${existingProvider.name}" vs "${name}". CIFs: ${existingProvider.cif} vs ${cif}`);

                // If the existing provider doesn't have a CIF and the new one does, update it
                if (!existingProvider.cif && cif) {
                    provider = await tx.provider.update({
                        where: { id: existingProvider.id },
                        data: {
                            cif,
                            name, // Update to the new name
                            email: email || existingProvider.email,
                            phone: phone || existingProvider.phone,
                            address: address || existingProvider.address,
                            type: providerType,
                        }
                    });
                    console.log(`Updated existing provider with similar name and added CIF: ${provider.name} (CIF: ${cif})`);
                    return provider;
                }

                // If both have CIFs but they're different, log a warning but create a new provider
                if (existingProvider.cif && existingProvider.cif !== cif) {
                    console.warn(`Similar provider names but different CIFs: "${existingProvider.name}" (${existingProvider.cif}) vs "${name}" (${cif}). Creating new provider.`);
                }
            }
        }

        // Use upsert to handle race conditions when creating new providers
        provider = await tx.provider.upsert({
            where: { cif },
            update: {
                name,
                email: email || undefined,
                phone: phone || undefined,
                address: address || undefined,
                type: providerType,
            },
            create: {
                cif,
                name,
                email,
                phone,
                address,
                type: providerType,
            },
        });

        console.log(`Created or found provider: ${name} (CIF: ${cif})`);
        return provider;

    } catch (error) {
        // Handle unique constraint violations that might still occur due to race conditions
        if (typeof error === 'object' && error !== null && 'code' in error &&
            (error as { code: string }).code === 'P2002') {

            console.log(`Race condition detected for provider CIF ${cif}, retrying with find operation...`);

            // If we hit a unique constraint, the provider was created by another transaction
            // Just find and return it
            const existingProvider = await tx.provider.findUnique({
                where: { cif },
            });

            if (existingProvider) {
                console.log(`Retrieved provider after race condition: ${existingProvider.name} (CIF: ${cif})`);
                return existingProvider;
            }
        }

        // Re-throw other errors
        throw error;
    }
}

async function findOrCreateMaterialTx(tx: Prisma.TransactionClient, materialName: string, materialCode?: string, providerType?: string): Promise<Material> {
    const normalizedName = materialName.trim();
    let material: Material | null = null;

    // Priorizar el código extraído del PDF por OpenAI
    const finalCode: string | null = materialCode ? normalizeMaterialCode(materialCode) : null;

    // Buscar primero por código exacto
    if (finalCode) {
        material = await tx.material.findUnique({
            where: { code: finalCode },
        });

        if (material) {
            console.log(`Found existing material by exact code: "${finalCode}" -> "${material.name}"`);
            return material;
        }
    }

    // Si no se encuentra por código exacto, buscar por referenceCode
    if (finalCode) {
        material = await tx.material.findFirst({
            where: { referenceCode: finalCode }
        });

        if (material) {
            console.log(`Found existing material by reference code: "${finalCode}" -> "${material.name}"`);
            return material;
        }
    }

    // Buscar por nombre exacto
    material = await tx.material.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' } }
    });

    if (material) {
        console.log(`Found existing material by exact name: "${normalizedName}" -> "${material.name}"`);
        return material;
    }

    // Solo si no encontramos nada, hacer búsqueda por similitud (más conservadora)
    if (finalCode && finalCode.length >= 6) {
        const allMaterials = await tx.material.findMany({
            select: { id: true, name: true, code: true, referenceCode: true, category: true }
        });

        for (const existingMaterial of allMaterials) {
            // Verificar similitud por código solo si ambos códigos son largos
            if (existingMaterial.code && areMaterialCodesSimilar(finalCode, existingMaterial.code)) {
                console.log(`Found material with similar code: "${existingMaterial.code}" vs "${finalCode}" for material "${materialName}"`);
                material = await tx.material.findUnique({
                    where: { id: existingMaterial.id }
                });
                break;
            }

            // También verificar con referenceCode
            if (existingMaterial.referenceCode && areMaterialCodesSimilar(finalCode, existingMaterial.referenceCode)) {
                console.log(`Found material with similar reference code: "${existingMaterial.referenceCode}" vs "${finalCode}" for material "${materialName}"`);
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
        const baseCode = materialCode || normalizedName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, '-')
            .substring(0, 45); // Leave room for suffix

        // Try to create with base code first, then with suffixes if needed
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            try {
                const codeToTry = attempts === 0 ? baseCode : `${baseCode}-${attempts}`;

                material = await tx.material.create({
                    data: {
                        code: codeToTry,
                        name: normalizedName,
                        category: category,
                        referenceCode: materialCode, // Guardar el código original extraído del PDF
                    },
                });
                break; // Success, exit loop
            } catch (error) {
                // Check if it's a unique constraint error on code
                if (typeof error === 'object' && error !== null && 'code' in error &&
                    (error as { code: string }).code === 'P2002' &&
                    'meta' in error && error.meta && typeof error.meta === 'object' &&
                    'target' in error.meta && Array.isArray((error.meta as { target: unknown }).target) &&
                    ((error.meta as { target: string[] }).target).includes('code')) {

                    attempts++;
                    console.log(`Material code conflict on attempt ${attempts} for material: ${normalizedName}. Trying with suffix...`);

                    if (attempts >= maxAttempts) {
                        // Final attempt: check if material was created by another transaction
                        const existingMaterial = await tx.material.findFirst({
                            where: { name: { equals: normalizedName, mode: 'insensitive' } }
                        });

                        if (existingMaterial) {
                            console.log(`Found existing material after race condition: ${existingMaterial.name}`);
                            material = existingMaterial;
                            break;
                        }

                        throw new Error(`Failed to create material '${normalizedName}' after ${maxAttempts} attempts due to code conflicts.`);
                    }
                    continue; // Try again with suffix
                } else {
                    // Re-throw other errors
                    throw error;
                }
            }
        }

        if (!material) {
            throw new Error(`Failed to create material '${normalizedName}' after exhausting all attempts.`);
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
            console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Previous price from ${previousInvoiceItemRecord.itemDate.toISOString()}: ${previousPrice}. Current unit price from ${effectiveDate.toISOString()}: ${currentUnitPriceDecimal}.`);

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
                        console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Price alert created. Old: ${previousPrice}, New: ${currentUnitPriceDecimal}, Change: ${percentageChangeDecimal.toFixed(2)}%, Effective Date: ${effectiveDate.toISOString()}`);
                    } catch (alertError) {
                        // Manejar error de constraint único
                        if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                            (alertError as { code: string }).code === 'P2002') {
                            console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Price alert already exists (caught constraint violation). Skipping duplicate creation.`);
                        } else {
                            // Re-lanzar otros errores
                            throw alertError;
                        }
                    }
                } else {
                    console.log(`[Invoice ${invoiceId}][Material '${createdMaterial.name}'] Price alert already exists for effective date ${effectiveDate.toISOString()}. Skipping duplicate creation.`);
                }
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

// Enhanced rate limit handling with exponential backoff
async function callPdfExtractAPIWithRetry(file: File, maxRetries: number = 3): Promise<CallPdfExtractAPIResponse> {
    let lastError: unknown = null;
    let lastRateLimitHeaders: OpenAIRateLimitHeaders | undefined = undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await callPdfExtractAPI(file);

            // If successful, check if we should add a small preventive delay for next requests
            if (result.rateLimitHeaders) {
                const { remainingRequests, remainingTokens } = result.rateLimitHeaders;
                lastRateLimitHeaders = result.rateLimitHeaders;

                // Only add minimal delay if we're very close to limits
                if ((remainingRequests !== undefined && remainingRequests < 3) ||
                    (remainingTokens !== undefined && remainingTokens < 3000)) {
                    console.log(`[RateLimit Prevention] Very low remaining resources after successful call. Adding 2s delay.`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            return result;

        } catch (error) {
            lastError = error;
            console.error(`[Attempt ${attempt}/${maxRetries}] Error calling PDF extract API for ${file.name}:`, error);

            // Check if it's a rate limit error (429 status)
            const isRateLimitError = error instanceof Error &&
                (error.message.includes('429') || error.message.toLowerCase().includes('rate limit'));

            if (isRateLimitError && attempt < maxRetries) {
                // Extract wait time from error message or use intelligent defaults
                let waitTime = 5000; // Start with 5 seconds instead of 60

                // Try to parse wait time from error message
                const waitTimeMatch = error.message.match(/try again in (\d+(?:\.\d+)?)s/);
                if (waitTimeMatch) {
                    waitTime = Math.max(1000, Math.ceil(parseFloat(waitTimeMatch[1]) * 1000));
                }

                // Use smarter backoff: start small and increase only if needed
                const baseBackoff = Math.min(waitTime, 10000); // Cap base wait at 10s
                const exponentialFactor = Math.pow(1.5, attempt - 1); // Gentler exponential growth
                const backoffTime = Math.min(baseBackoff * exponentialFactor, 45000); // Cap total at 45s

                console.log(`[RateLimit] Attempt ${attempt} rate limited. Smart wait: ${backoffTime / 1000}s (base: ${baseBackoff / 1000}s, factor: ${exponentialFactor.toFixed(1)})`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
            }

            // For non-rate-limit errors, only retry with minimal delay
            if (!isRateLimitError && attempt < maxRetries) {
                const quickRetryDelay = 1000 * attempt; // 1s, 2s for attempts 1, 2
                console.log(`[Retry] Non-rate-limit error on attempt ${attempt}. Quick retry in ${quickRetryDelay / 1000}s...`);
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
        error: `Failed after ${maxRetries} attempts: ${errorMessage}`,
        rateLimitHeaders: lastRateLimitHeaders
    };
}

export async function createInvoiceFromFiles(
    formDataWithFiles: FormData
): Promise<{ overallSuccess: boolean; results: CreateInvoiceResult[] }> {
    const files = formDataWithFiles.getAll("files") as File[];
    if (!files || files.length === 0) {
        return { overallSuccess: false, results: [{ success: false, message: "No files provided.", fileName: "N/A" }] };
    }

    // Dynamic concurrency based on file count and rate limits
    let CONCURRENCY_LIMIT = Math.min(12, Math.max(4, Math.ceil(files.length / 5))); // Start between 4-12 based on file count
    const allFileProcessingResults: Array<ExtractedFileItem & { rateLimitHeaders?: OpenAIRateLimitHeaders }> = [];
    let lastKnownRateLimits: OpenAIRateLimitHeaders | undefined = undefined;
    let consecutiveRateLimitHits = 0;

    console.log(`Starting extraction for ${files.length} files with initial concurrency limit of ${CONCURRENCY_LIMIT}.`);

    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
        const fileChunk = files.slice(i, i + CONCURRENCY_LIMIT);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(files.length / CONCURRENCY_LIMIT);

        console.log(`Processing batch ${batchNumber} of ${totalBatches} (files ${i + 1} to ${i + fileChunk.length} of ${files.length}) with concurrency ${CONCURRENCY_LIMIT}.`);

        // Smart rate limit checking - only wait if we're actually close to limits
        if (lastKnownRateLimits) {
            let shouldWait = false;
            let waitTimeMs = 0;
            let waitReason = "";

            // More aggressive thresholds - only wait when very close to limits
            if (lastKnownRateLimits.remainingRequests !== undefined && lastKnownRateLimits.remainingRequests < 2) {
                shouldWait = true;
                waitTimeMs = Math.max(waitTimeMs, lastKnownRateLimits.resetRequestsTimeMs || 60000);
                waitReason += " requests";
            }

            // More realistic token estimation (most invoices use 4000-6000 tokens)
            const estimatedTokensNeeded = fileChunk.length * 5000; // Reduced from 8000
            if (lastKnownRateLimits.remainingTokens !== undefined && lastKnownRateLimits.remainingTokens < estimatedTokensNeeded * 0.8) {
                shouldWait = true;
                waitTimeMs = Math.max(waitTimeMs, lastKnownRateLimits.resetTokensTimeMs || 60000);
                waitReason += " tokens";
            }

            if (shouldWait) {
                // Adaptive waiting - don't wait for full reset, use partial wait
                const adaptiveWaitTime = Math.min(waitTimeMs, 30000 + (consecutiveRateLimitHits * 5000)); // Cap at 30s + penalty
                console.warn(`[RateLimit] Close to limits (${waitReason.trim()}). Requests: ${lastKnownRateLimits.remainingRequests}, Tokens: ${lastKnownRateLimits.remainingTokens}. Waiting ${adaptiveWaitTime / 1000}s (adaptive).`);
                await new Promise(resolve => setTimeout(resolve, adaptiveWaitTime));
                consecutiveRateLimitHits++;

                // Reduce concurrency if we're hitting limits repeatedly
                if (consecutiveRateLimitHits >= 2 && CONCURRENCY_LIMIT > 3) {
                    CONCURRENCY_LIMIT = Math.max(3, Math.floor(CONCURRENCY_LIMIT * 0.7));
                    console.log(`[RateLimit] Reducing concurrency to ${CONCURRENCY_LIMIT} due to repeated limits`);
                }
            } else {
                // Reset consecutive hits if we're not hitting limits
                consecutiveRateLimitHits = 0;

                // Increase concurrency if we have plenty of headroom
                if (lastKnownRateLimits.remainingRequests !== undefined && lastKnownRateLimits.remainingRequests > 20 &&
                    lastKnownRateLimits.remainingTokens !== undefined && lastKnownRateLimits.remainingTokens > 50000 &&
                    CONCURRENCY_LIMIT < 15) {
                    CONCURRENCY_LIMIT = Math.min(15, CONCURRENCY_LIMIT + 1);
                    console.log(`[RateLimit] Increasing concurrency to ${CONCURRENCY_LIMIT} due to available headroom`);
                }
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
                // Use the retry wrapper function with dynamic retry count based on rate limit hits
                const maxRetries = consecutiveRateLimitHits > 0 ? 2 : 3; // Reduce retries if hitting limits
                const { extractedData, error: extractionError, rateLimitHeaders } = await callPdfExtractAPIWithRetry(file, maxRetries);

                if (extractionError) {
                    return { file, extractedData, error: extractionError, fileName: file.name, rateLimitHeaders };
                }

                if (!extractedData) {
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
            } catch (topLevelError: unknown) {
                console.error(`[Batch ${batchNumber}] Unexpected error during file processing for ${file.name}:`, topLevelError);
                const errorMessage = topLevelError instanceof Error ? topLevelError.message : "Unknown error during file item processing.";
                return { file, extractedData: null, error: errorMessage, fileName: file.name, rateLimitHeaders: undefined };
            }
        });

        const chunkResults = await Promise.all(chunkExtractionPromises);
        allFileProcessingResults.push(...chunkResults);

        // Update rate limits more intelligently - prioritize the most restrictive
        for (const result of chunkResults) {
            if (result.rateLimitHeaders) {
                if (!lastKnownRateLimits ||
                    (result.rateLimitHeaders.remainingRequests !== undefined &&
                        (lastKnownRateLimits.remainingRequests === undefined || result.rateLimitHeaders.remainingRequests < lastKnownRateLimits.remainingRequests)) ||
                    (result.rateLimitHeaders.remainingTokens !== undefined &&
                        (lastKnownRateLimits.remainingTokens === undefined || result.rateLimitHeaders.remainingTokens < lastKnownRateLimits.remainingTokens))) {
                    lastKnownRateLimits = result.rateLimitHeaders;
                }
            }
        }

        if (lastKnownRateLimits) {
            console.log(`[RateLimit] After Batch ${batchNumber}: Remaining Requests: ${lastKnownRateLimits.remainingRequests ?? 'N/A'}, Remaining Tokens: ${lastKnownRateLimits.remainingTokens ?? 'N/A'}, Consecutive Hits: ${consecutiveRateLimitHits}`);
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

    // 4. Process database operations with controlled concurrency
    const DB_CONCURRENCY_LIMIT = 2; // Reduced from 3 to minimize race conditions
    const dbResults: CreateInvoiceResult[] = [];

    for (let i = 0; i < processableItems.length; i += DB_CONCURRENCY_LIMIT) {
        const chunk = processableItems.slice(i, i + DB_CONCURRENCY_LIMIT);

        const chunkPromises = chunk.map(async (item): Promise<CreateInvoiceResult> => {
            const { file, extractedData, fileName } = item;
            if (!extractedData) {
                return { success: false, message: "No extracted data", fileName: fileName };
            }

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
                    const intraInvoiceMaterialPriceHistory = new Map<string, { price: Prisma.Decimal; date: Date; invoiceItemId: string }>();

                    for (const itemData of extractedData.items) {
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
                            console.log(`[Invoice ${invoice.invoiceCode}][Item: ${itemData.materialName}] Marked as non-material. Creating InvoiceItem only.`);
                            const quantityDecimal = new Prisma.Decimal(itemData.quantity.toFixed(2));
                            const currentUnitPriceDecimal = new Prisma.Decimal(itemData.unitPrice.toFixed(2));
                            const totalPriceDecimal = new Prisma.Decimal(itemData.totalPrice.toFixed(2));
                            const effectiveItemDate = itemData.itemDate ? new Date(itemData.itemDate) : currentInvoiceIssueDate;

                            await tx.invoiceItem.create({
                                data: {
                                    invoiceId: invoice.id,
                                    materialId: (await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialCode, provider.type)).id,
                                    quantity: quantityDecimal,
                                    unitPrice: currentUnitPriceDecimal,
                                    totalPrice: totalPriceDecimal,
                                    itemDate: effectiveItemDate,
                                    workOrder: itemData.workOrder || null,
                                },
                            });
                            console.log(`[Invoice ${invoice.invoiceCode}] Non-material item "${itemData.materialName}" added to invoice items. No price alert/MaterialProvider update.`);
                            continue;
                        }

                        let material: Material;
                        try {
                            material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialCode, provider.type);
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
                                } catch (alertError) {
                                    // Manejar error de constraint único para alertas intra-factura
                                    if (typeof alertError === 'object' && alertError !== null && 'code' in alertError &&
                                        (alertError as { code: string }).code === 'P2002') {
                                        console.log(`[Invoice ${invoice.invoiceCode}][Material '${material.name}'] Intra-invoice price alert already exists (caught constraint violation). Skipping duplicate creation.`);
                                        // No incrementar alertsCounter en este caso
                                        alertsCounter--; // Compensar el incremento que viene después
                                    } else {
                                        throw alertError;
                                    }
                                }
                                alertsCounter++;
                                console.log(`[Invoice ${invoice.invoiceCode}][Material '${material.name}'] INTRA-INVOICE Price alert created. Old (from item ${lastSeenPriceRecordInThisInvoice.invoiceItemId} in this invoice): ${lastSeenPriceRecordInThisInvoice.price}, New (current item): ${currentItemUnitPrice}, Change: ${percentageChangeDecimal.toFixed(2)}%, Effective Date: ${effectiveItemDate.toISOString()}`);
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
                console.error(`Error processing sorted invoice from ${fileName}:`, error);
                const baseMessage = `Failed to create invoice from ${fileName}`;
                let specificMessage = "An unexpected error occurred.";

                if (error instanceof Error) {
                    specificMessage = error.message;

                    if (specificMessage.includes('Failed to process material')) {
                        specificMessage = `Material processing error: ${specificMessage}`;
                    } else if (specificMessage.includes('after 10 attempts due to code conflicts')) {
                        specificMessage = `Unable to create unique material code. This may indicate a data consistency issue.`;
                    } else if (specificMessage.includes('Provider') && specificMessage.includes('is blocked')) {
                        specificMessage = `This provider is not allowed for processing.`;
                    }
                }

                const isPrismaP2002Error = (e: unknown): e is { code: string; meta?: { target?: string[] } } => {
                    return typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';
                };

                if (isPrismaP2002Error(error)) {
                    if (error.meta && error.meta.target) {
                        if (error.meta.target.includes('invoiceCode') && extractedData) {
                            console.warn(`Duplicate invoice code '${extractedData.invoiceCode}' for file: ${fileName}`);
                            specificMessage = `An invoice with code '${extractedData.invoiceCode}' already exists.`;
                        } else if (error.meta.target.includes('code')) {
                            specificMessage = `A material with this code already exists. This is usually handled automatically, but a race condition may have occurred.`;
                        }
                    }
                }
                return { success: false, message: `${baseMessage}: ${specificMessage}`, fileName: fileName };
            }
        });

        const chunkResults = await Promise.all(chunkPromises);
        dbResults.push(...chunkResults);
    }

    // Combine extraction errors with database results
    finalResults.push(...dbResults);

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
                const material = await findOrCreateMaterialTx(tx, itemData.materialName, itemData.materialCode, provider.type);

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
                                        console.log(`[Manual Invoice ${invoice.invoiceCode}][Material '${material.name}'] Price alert already exists (caught constraint violation). Skipping duplicate creation.`);
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