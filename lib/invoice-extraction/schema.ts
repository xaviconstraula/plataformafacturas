import { Type } from '@google/genai';
import { z } from 'zod';

const geminiItemProperties = {
    materialName: {
        type: Type.STRING,
        description: 'Product concept from CONCEPTO/DESCRIPCIÓN column. Never a price or amount.',
    },
    materialCode: {
        type: Type.STRING,
        description: 'Product code from CÓDIGO/REF column. Omit or null if missing.',
        nullable: true,
    },
    isMaterial: {
        type: Type.BOOLEAN,
        description: 'true for products, false for services.',
    },
    quantity: { type: Type.NUMBER },
    discountRaw: {
        type: Type.STRING,
        description: 'Discount as shown: "0", "10", "50 5", or "NETO".',
        nullable: true,
    },
    unitPrice: { type: Type.NUMBER },
    totalPrice: { type: Type.NUMBER },
    itemDate: {
        type: Type.STRING,
        description: 'YYYY-MM-DD if different from invoice date, else null.',
        nullable: true,
    },
    workOrder: { type: Type.STRING, nullable: true },
    description: {
        type: Type.STRING,
        description: 'Extra line detail if separate from main concept; else null.',
        nullable: true,
    },
    lineNumber: {
        type: Type.INTEGER,
        description: '1-based row order on the invoice.',
        nullable: true,
    },
} as const;

const geminiItemSchema = {
    type: Type.OBJECT,
    properties: geminiItemProperties,
    required: ['materialName', 'isMaterial', 'quantity', 'unitPrice', 'totalPrice'],
    propertyOrdering: [
        'lineNumber',
        'materialName',
        'materialCode',
        'isMaterial',
        'quantity',
        'discountRaw',
        'unitPrice',
        'totalPrice',
        'itemDate',
        'workOrder',
        'description',
    ],
};

const geminiProviderProperties = {
    name: { type: Type.STRING },
    cif: {
        type: Type.STRING,
        description: 'VAT ID with country prefix, e.g. ESB12345678. No spaces.',
    },
    email: { type: Type.STRING, nullable: true },
    phone: { type: Type.STRING, nullable: true },
    address: { type: Type.STRING, nullable: true },
} as const;

/** Full invoice JSON schema for Gemini responseJsonSchema. */
export const EXTRACTED_INVOICE_JSON_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        invoiceCode: { type: Type.STRING },
        issueDate: {
            type: Type.STRING,
            description: 'Invoice date YYYY-MM-DD',
        },
        totalAmount: { type: Type.NUMBER, description: 'Total with IVA' },
        ivaPercentage: { type: Type.NUMBER, description: 'e.g. 21.00' },
        retentionAmount: { type: Type.NUMBER, description: 'Withholding amount, 0.00 if none' },
        provider: {
            type: Type.OBJECT,
            properties: geminiProviderProperties,
            required: ['name', 'cif'],
        },
        items: {
            type: Type.ARRAY,
            items: geminiItemSchema,
        },
    },
    required: ['invoiceCode', 'issueDate', 'totalAmount', 'ivaPercentage', 'retentionAmount', 'provider', 'items'],
    propertyOrdering: [
        'invoiceCode',
        'issueDate',
        'totalAmount',
        'ivaPercentage',
        'retentionAmount',
        'provider',
        'items',
    ],
};

/** Follow-up schema when only additional line items are requested. */
export const EXTRACTED_ITEMS_JSON_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        items: {
            type: Type.ARRAY,
            items: geminiItemSchema,
        },
    },
    required: ['items'],
};

const zItem = z.object({
    materialName: z.string(),
    materialCode: z.string().nullable().optional(),
    isMaterial: z.boolean(),
    quantity: z.number(),
    discountRaw: z.string().nullable().optional(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    itemDate: z.string().nullable().optional(),
    workOrder: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    lineNumber: z.number().nullable().optional(),
});

export const extractedInvoiceZodSchema = z.object({
    invoiceCode: z.string(),
    issueDate: z.string(),
    totalAmount: z.number(),
    ivaPercentage: z.number().optional(),
    retentionAmount: z.number().optional(),
    provider: z.object({
        name: z.string(),
        cif: z.string(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
    }),
    items: z.array(zItem),
});

export const extractedItemsOnlyZodSchema = z.object({
    items: z.array(zItem),
});

export type ExtractedInvoiceJson = z.infer<typeof extractedInvoiceZodSchema>;
export type ExtractedItemsOnlyJson = z.infer<typeof extractedItemsOnlyZodSchema>;
