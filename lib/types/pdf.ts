export interface ExtractedPdfProviderData {
    name: string;
    cif: string;
    email?: string;
    phone?: string;
    address?: string;
}

export interface ExtractedPdfItemData {
    materialName: string;
    materialCode?: string; // Código de referencia del producto extraído del PDF
    materialDescription?: string;
    quantity: number;
    listPrice?: number;
    discountPercentage?: number; // Combined/effective discount (calculated from discountRaw)
    discountRaw?: string; // Raw discount text from invoice (e.g., "50 5" for sequential discounts)
    unitPrice: number;
    totalPrice: number;
    itemDate?: string; // Optional ISO date string for items with different dates
    isMaterial: boolean; // New field to indicate if the item is a material
    workOrder?: string; // OT/CECO - Work Order or Cost Center
    description?: string; // Additional description for the line item
    lineNumber?: number; // Line number if present on the invoice
}

export interface ExtractedPdfData {
    invoiceCode: string;
    provider: ExtractedPdfProviderData;
    issueDate: string; // ISO date string
    totalAmount: number;
    items: ExtractedPdfItemData[];
}

export interface ExtractedFileItem {
    file: File;
    extractedData: ExtractedPdfData | null;
    error?: string;
    fileName: string;
    pageNumber?: number; // Added to track which page in multi-page PDFs
} 