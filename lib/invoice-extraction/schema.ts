import { Type } from '@google/genai';
import { z } from 'zod';

const geminiItemProperties = {
    materialName: {
        type: Type.STRING,
        description: 'Human-readable product/service concept from CONCEPTO/DESCRIPCIÓN column. Never a price, amount, or bare code.',
    },
    materialCode: {
        type: Type.STRING,
        description: 'Product reference from CÓDIGO/REF/ARTÍCULO column on this row. null if missing.',
        nullable: true,
    },
    isMaterial: {
        type: Type.BOOLEAN,
        description: 'true for physical products, false for services.',
    },
    quantity: {
        type: Type.NUMBER,
        description: 'Units from CANT/Uds column for this row. 0 if blank.',
    },
    discountRaw: {
        type: Type.STRING,
        description: 'Discount as printed on invoice: "0", "10", "50 5", or "NETO".',
        nullable: true,
    },
    unitPrice: {
        type: Type.NUMBER,
        description: 'Unit price of THIS row from PRECIO UNITARIO. 0.00 if cell is blank (e.g. PACK/KIT).',
    },
    totalPrice: {
        type: Type.NUMBER,
        description: 'Line total of THIS row from IMPORTE/TOTAL. 0.00 if cell is blank.',
    },
    itemDate: {
        type: Type.STRING,
        description: 'YYYY-MM-DD only if line date differs from invoice issueDate; else null.',
        nullable: true,
    },
    workOrder: {
        type: Type.STRING,
        description: 'OT/CECO inherited from section header (e.g. S/REF). null if none.',
        nullable: true,
    },
    description: {
        type: Type.STRING,
        description: 'Extra line detail beyond materialName; null if redundant.',
        nullable: true,
    },
    lineNumber: {
        type: Type.INTEGER,
        description: '1-based visual row order on the invoice (1, 2, 3…).',
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
    name: {
        type: Type.STRING,
        description: 'Legal or trade name of the invoice issuer.',
    },
    cif: {
        type: Type.STRING,
        description: 'VAT ID with country prefix, e.g. ESB12345678. No spaces or separators.',
    },
    email: { type: Type.STRING, nullable: true },
    phone: { type: Type.STRING, nullable: true },
    address: { type: Type.STRING, nullable: true },
} as const;

/** Full invoice JSON schema for Gemini responseJsonSchema. */
export const EXTRACTED_INVOICE_JSON_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        invoiceCode: {
            type: Type.STRING,
            description: 'Invoice number (not order or delivery note).',
        },
        issueDate: {
            type: Type.STRING,
            description: 'Invoice issue date as YYYY-MM-DD (convert from DD/MM/YYYY).',
        },
        totalAmount: {
            type: Type.NUMBER,
            description: 'Total amount to pay WITH IVA included.',
        },
        ivaPercentage: {
            type: Type.NUMBER,
            description: 'Primary VAT rate, e.g. 21.00. Default 21.00 if unclear.',
        },
        retentionAmount: {
            type: Type.NUMBER,
            description: 'IRPF withholding amount in euros. 0.00 if none.',
        },
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
