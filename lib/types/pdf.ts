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