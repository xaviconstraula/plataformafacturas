export interface ExtractedPdfProviderData {
    name: string;
    cif: string;
    email?: string;
    phone?: string;
    address?: string;
}

export interface ExtractedPdfItemData {
    materialName: string;
    materialDescription?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
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