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
    itemDate?: string; // Optional ISO date string for items with different dates
    isMaterial: boolean; // New field to indicate if the item is a material
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