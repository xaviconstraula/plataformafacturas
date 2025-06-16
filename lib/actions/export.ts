import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';

export interface ExportFilters {
    materialId?: string;
    category?: string;
    workOrder?: string;
    supplierId?: string;
    startDate?: Date;
    endDate?: Date;
    minPrice?: number;
    maxPrice?: number;
    fiscalYear?: number;
    naturalYear?: number;
}

export interface InvoiceItemExport {
    'Código Factura': string;
    'Proveedor': string;
    'CIF Proveedor': string;
    'Tipo Proveedor': string;
    'Fecha Factura': string;
    'Total Factura': number;
    'Código Material': string;
    'Nombre Material': string;
    'Categoría': string;
    'Descripción Línea': string;
    'Cantidad': number;
    'Precio Unitario': number;
    'Total Línea': number;
    'OT/CECO': string;
    'Fecha Línea': string;
    'Número Línea': number;
    'Grupo Producto': string;
}

export interface MaterialSummaryExport {
    'Código Material': string;
    'Nombre Material': string;
    'Categoría': string;
    'Grupo Producto': string;
    'Cantidad Total': number;
    'Coste Total': number;
    'Precio Promedio': number;
    'Nº Facturas': number;
    'Nº Proveedores': number;
    'Última Compra': string;
    'OTs Asociadas': string;
}

export interface SupplierSummaryExport {
    'Nombre Proveedor': string;
    'CIF': string;
    'Tipo': string;
    'Gasto Total': number;
    'Nº Facturas': number;
    'Nº Materiales': number;
    'Nº OTs': number;
    'Promedio por Factura': number;
    'Última Factura': string;
}

// Helper function to process workOrder search terms
function processWorkOrderSearch(workOrder: string): string {
    return workOrder.replace(/\s+/g, '-');
}

export async function exportDetailedInvoiceData(filters: ExportFilters = {}) {
    const where: Prisma.InvoiceItemWhereInput = buildWhereClause(filters);

    const items = await prisma.invoiceItem.findMany({
        where,
        include: {
            material: {
                include: {
                    productGroup: true
                }
            },
            invoice: {
                include: {
                    provider: true
                }
            }
        },
        orderBy: [
            { invoice: { issueDate: 'desc' } },
            { lineNumber: 'asc' }
        ]
    });

    const exportData: InvoiceItemExport[] = items.map(item => ({
        'Código Factura': item.invoice.invoiceCode,
        'Proveedor': item.invoice.provider.name,
        'CIF Proveedor': item.invoice.provider.cif,
        'Tipo Proveedor': item.invoice.provider.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
        'Fecha Factura': item.invoice.issueDate.toLocaleDateString('es-ES'),
        'Total Factura': item.invoice.totalAmount.toNumber(),
        'Código Material': item.material.code,
        'Nombre Material': item.material.name,
        'Categoría': item.material.category || '',
        'Descripción Línea': item.description || '',
        'Cantidad': item.quantity.toNumber(),
        'Precio Unitario': item.unitPrice.toNumber(),
        'Total Línea': item.totalPrice.toNumber(),
        'OT/CECO': item.workOrder || '',
        'Fecha Línea': item.itemDate.toLocaleDateString('es-ES'),
        'Número Línea': item.lineNumber || 0,
        'Grupo Producto': item.material.productGroup?.standardizedName || ''
    }));

    return exportData;
}

export async function exportMaterialSummary(filters: ExportFilters = {}) {
    const where: Prisma.InvoiceItemWhereInput = buildWhereClause(filters);

    const items = await prisma.invoiceItem.findMany({
        where,
        include: {
            material: {
                include: {
                    productGroup: true
                }
            },
            invoice: {
                include: {
                    provider: true
                }
            }
        }
    });

    // Group by material
    const materialGroups = new Map<string, typeof items>();

    for (const item of items) {
        const materialId = item.materialId;
        if (!materialGroups.has(materialId)) {
            materialGroups.set(materialId, []);
        }
        materialGroups.get(materialId)!.push(item);
    }

    const exportData: MaterialSummaryExport[] = [];

    for (const [materialId, materialItems] of materialGroups) {
        const material = materialItems[0].material;
        const totalQuantity = materialItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
        const totalCost = materialItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const averagePrice = totalCost / totalQuantity;
        const uniqueSuppliers = new Set(materialItems.map(item => item.invoice.providerId));
        const uniqueInvoices = new Set(materialItems.map(item => item.invoiceId));
        const workOrders = [...new Set(materialItems.map(item => item.workOrder).filter(Boolean))];
        const lastPurchase = materialItems.sort((a, b) => b.itemDate.getTime() - a.itemDate.getTime())[0];

        exportData.push({
            'Código Material': material.code,
            'Nombre Material': material.name,
            'Categoría': material.category || '',
            'Grupo Producto': material.productGroup?.standardizedName || '',
            'Cantidad Total': totalQuantity,
            'Coste Total': totalCost,
            'Precio Promedio': averagePrice,
            'Nº Facturas': uniqueInvoices.size,
            'Nº Proveedores': uniqueSuppliers.size,
            'Última Compra': lastPurchase.itemDate.toLocaleDateString('es-ES'),
            'OTs Asociadas': workOrders.join(', ')
        });
    }

    return exportData.sort((a, b) => b['Coste Total'] - a['Coste Total']);
}

export async function exportSupplierSummary(filters: ExportFilters = {}) {
    const where: Prisma.InvoiceWhereInput = {
        ...(filters.supplierId ? { providerId: filters.supplierId } : {}),
        ...(filters.startDate || filters.endDate ? {
            issueDate: {
                ...(filters.startDate ? { gte: filters.startDate } : {}),
                ...(filters.endDate ? { lte: filters.endDate } : {})
            }
        } : {}),
        ...(filters.fiscalYear ? {
            issueDate: {
                gte: new Date(filters.fiscalYear, 3, 1), // Abril 1
                lt: new Date(filters.fiscalYear + 1, 3, 1)
            }
        } : {}),
        ...(filters.naturalYear ? {
            issueDate: {
                gte: new Date(filters.naturalYear, 0, 1), // Enero 1
                lt: new Date(filters.naturalYear + 1, 0, 1)
            }
        } : {}),
        ...(filters.workOrder || filters.materialId || filters.category ? {
            items: {
                some: {
                    ...(filters.workOrder ? { workOrder: { contains: processWorkOrderSearch(filters.workOrder), mode: 'insensitive' } } : {}),
                    ...(filters.materialId ? { materialId: filters.materialId } : {}),
                    ...(filters.category ? { material: { category: { contains: filters.category, mode: 'insensitive' } } } : {})
                }
            }
        } : {})
    };

    const invoices = await prisma.invoice.findMany({
        where,
        include: {
            provider: true,
            items: {
                include: {
                    material: true
                }
            }
        }
    });

    // Group by supplier
    const supplierGroups = new Map<string, typeof invoices>();

    for (const invoice of invoices) {
        const supplierId = invoice.providerId;
        if (!supplierGroups.has(supplierId)) {
            supplierGroups.set(supplierId, []);
        }
        supplierGroups.get(supplierId)!.push(invoice);
    }

    const exportData: SupplierSummaryExport[] = [];

    for (const [supplierId, supplierInvoices] of supplierGroups) {
        const supplier = supplierInvoices[0].provider;
        const totalSpent = supplierInvoices.reduce((sum, invoice) => sum + invoice.totalAmount.toNumber(), 0);
        const averageInvoiceAmount = totalSpent / supplierInvoices.length;
        const allItems = supplierInvoices.flatMap(invoice => invoice.items);
        const uniqueMaterials = new Set(allItems.map(item => item.materialId));
        const uniqueWorkOrders = new Set(allItems.map(item => item.workOrder).filter(Boolean));
        const lastInvoice = supplierInvoices.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime())[0];

        exportData.push({
            'Nombre Proveedor': supplier.name,
            'CIF': supplier.cif,
            'Tipo': supplier.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
            'Gasto Total': totalSpent,
            'Nº Facturas': supplierInvoices.length,
            'Nº Materiales': uniqueMaterials.size,
            'Nº OTs': uniqueWorkOrders.size,
            'Promedio por Factura': averageInvoiceAmount,
            'Última Factura': lastInvoice.issueDate.toLocaleDateString('es-ES')
        });
    }

    return exportData.sort((a, b) => b['Gasto Total'] - a['Gasto Total']);
}

export async function generateExcelReport(filters: ExportFilters = {}, includeDetails = true) {
    const workbook = XLSX.utils.book_new();

    // Add supplier summary sheet
    const supplierData = await exportSupplierSummary(filters);
    const supplierSheet = XLSX.utils.json_to_sheet(supplierData);
    XLSX.utils.book_append_sheet(workbook, supplierSheet, 'Resumen Proveedores');

    // Add material summary sheet
    const materialData = await exportMaterialSummary(filters);
    const materialSheet = XLSX.utils.json_to_sheet(materialData);
    XLSX.utils.book_append_sheet(workbook, materialSheet, 'Resumen Materiales');

    // Add detailed data if requested
    if (includeDetails) {
        const detailData = await exportDetailedInvoiceData(filters);
        const detailSheet = XLSX.utils.json_to_sheet(detailData);
        XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle Completo');
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    return buffer;
}

function buildWhereClause(filters: ExportFilters): Prisma.InvoiceItemWhereInput {
    return {
        ...(filters.materialId ? { materialId: filters.materialId } : {}),
        ...(filters.category ? { material: { category: { contains: filters.category, mode: 'insensitive' } } } : {}),
        ...(filters.workOrder ? { workOrder: { contains: processWorkOrderSearch(filters.workOrder), mode: 'insensitive' } } : {}),
        ...(filters.supplierId ? { invoice: { providerId: filters.supplierId } } : {}),
        ...(filters.minPrice ? { unitPrice: { gte: filters.minPrice } } : {}),
        ...(filters.maxPrice ? { unitPrice: { lte: filters.maxPrice } } : {}),
        ...(filters.startDate || filters.endDate ? {
            itemDate: {
                ...(filters.startDate ? { gte: filters.startDate } : {}),
                ...(filters.endDate ? { lte: filters.endDate } : {})
            }
        } : {}),
        ...(filters.fiscalYear ? {
            itemDate: {
                gte: new Date(filters.fiscalYear, 3, 1), // Abril 1
                lt: new Date(filters.fiscalYear + 1, 3, 1)
            }
        } : {}),
        ...(filters.naturalYear ? {
            itemDate: {
                gte: new Date(filters.naturalYear, 0, 1), // Enero 1
                lt: new Date(filters.naturalYear + 1, 0, 1)
            }
        } : {})
    };
} 