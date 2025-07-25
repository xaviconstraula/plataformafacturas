import * as XLSX from 'xlsx-js-style';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import type { InvoiceItem, Material, Invoice, Provider, ProviderType } from '@/generated/prisma';
import { normalizeSearch, processWorkOrderSearch } from '@/lib/utils';

// Helper function to create worksheet with bold headers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createStyledWorksheet(data: Record<string, any>[], columnWidths?: { wch: number }[]) {
    if (data.length === 0) {
        return XLSX.utils.json_to_sheet([]);
    }

    // Create the worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Get the headers (first row)
    const headers = Object.keys(data[0]);

    // Apply bold styling to header row
    headers.forEach((header, index) => {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
        if (worksheet[cellAddress]) {
            worksheet[cellAddress].s = {
                font: {
                    bold: true,
                    sz: 12
                },
                fill: {
                    fgColor: { rgb: "E8F4FD" } // Light blue background
                },
                border: {
                    top: { style: "thin", color: { rgb: "000000" } },
                    bottom: { style: "thin", color: { rgb: "000000" } },
                    left: { style: "thin", color: { rgb: "000000" } },
                    right: { style: "thin", color: { rgb: "000000" } }
                },
                alignment: {
                    horizontal: "center",
                    vertical: "center"
                }
            };
        }
    });

    // Set column widths if provided
    if (columnWidths) {
        worksheet['!cols'] = columnWidths;
    }

    return worksheet;
}

export interface ExportFilters {
    materialId?: string;
    category?: string;
    workOrder?: string;
    supplierId?: string;
    supplierCif?: string;
    supplierType?: string;
    startDate?: Date;
    endDate?: Date;
    minPrice?: number;
    maxPrice?: number;
    fiscalYear?: number;
    naturalYear?: number;
    // Additional filters for materials page
    materialSearch?: string;
    minUnitPrice?: number;
    maxUnitPrice?: number;
    minTotalCost?: number;
    maxTotalCost?: number;
    minQuantity?: number;
    maxQuantity?: number;
    // Export type indicator
    exportType?: 'workorders-list' | 'materials-list' | 'suppliers-list' | 'specific-workorder' | 'analytics' | 'general';
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
    'Cantidad': number;
    'Precio Unitario': number;
    'Total Línea': number;
    'OT/CECO': string;
    'Fecha Línea': string;
}

export interface MaterialSummaryExport {
    'Código Material': string;
    'Nombre Material': string;
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

export interface WorkOrderSummaryExport {
    'Orden de Trabajo': string;
    'Coste Total (c/IVA)': number;
    'Coste Base Imponible': number;
    'IVA (21%)': number;
    'Total Items': number;
    'Cantidad Total': number;
    'Nº Proveedores': number;
    'Nº Materiales': number;
    'Fecha Inicio': string;
    'Fecha Fin': string;
    'Periodo (días)': number;
}

export interface WorkOrderByProviderDetailExport {
    'Orden de Trabajo': string;
    'Proveedor': string;
    'CIF Proveedor': string;
    'Tipo Proveedor': string;
    '--- RESUMEN ---': string;
    'Coste Total (c/IVA)': number | string;
    'Coste Base': number | string;
    'IVA': number | string;
    'Total Items': number | string;
    'Cantidad Total': number | string;
    'Nº Materiales': number | string;
    '--- DETALLE ITEMS ---': string;
    'Fecha Item': string;
    'Material': string;
    'Código Material': string;
    'Cantidad Item': number | string;
    'Precio Unitario': number | string;
    'Total Item (c/IVA)': number | string;
    'Nº Factura': string;
}

export interface WorkOrderByMaterialDetailExport {
    'Orden de Trabajo': string;
    'Material': string;
    'Código Material': string;
    '--- RESUMEN ---': string;
    'Coste Total (c/IVA)': number | string;
    'Coste Base': number | string;
    'IVA': number | string;
    'Cantidad Total': number | string;
    'Precio Promedio': number | string;
    'Nº Proveedores': number | string;
    'Nº Items': number | string;
    '--- DETALLE ITEMS ---': string;
    'Fecha Item': string;
    'Proveedor': string;
    'Cantidad Item': number | string;
    'Precio Unitario': number | string;
    'Total Item (c/IVA)': number | string;
    'Nº Factura': string;
}

export interface WorkOrderByMonthDetailExport {
    'Orden de Trabajo': string;
    'Año': number | string;
    'Mes': number | string;
    'Mes Nombre': string;
    '--- RESUMEN ---': string;
    'Coste Total (c/IVA)': number | string;
    'Coste Base': number | string;
    'IVA': number | string;
    'Total Items': number | string;
    'Cantidad Total': number | string;
    'Nº Proveedores': number | string;
    'Nº Materiales': number | string;
    '--- DETALLE ITEMS ---': string;
    'Fecha Item': string;
    'Material': string;
    'Código Material': string;
    'Proveedor': string;
    'Cantidad Item': number | string;
    'Precio Unitario': number | string;
    'Total Item (c/IVA)': number | string;
    'Nº Factura': string;
}

// New interfaces for detailed supplier and material exports
export interface SupplierDetailExport {
    'Proveedor': string;
    'CIF': string;
    'Tipo': string;
    '--- RESUMEN ---': string;
    'Gasto Total (c/IVA)': number | string;
    'Gasto Base': number | string;
    'IVA': number | string;
    'Nº Facturas': number | string;
    'Nº Items': number | string;
    'Nº Materiales': number | string;
    'Nº OTs': number | string;
    'Promedio Factura': number | string;
    'Última Factura': string;
    '--- DETALLE ITEMS ---': string;
    'Fecha Item': string;
    'Material': string;
    'Código Material': string;
    'OT/CECO': string;
    'Cantidad': number | string;
    'Precio Unitario': number | string;
    'Total Item (c/IVA)': number | string;
    'Nº Factura': string;
}

export interface MaterialDetailExport {
    'Material': string;
    'Código Material': string;
    'Categoría': string;
    '--- RESUMEN ---': string;
    'Coste Total (c/IVA)': number | string;
    'Coste Base': number | string;
    'IVA': number | string;
    'Cantidad Total': number | string;
    'Precio Promedio': number | string;
    'Nº Proveedores': number | string;
    'Nº Items': number | string;
    'Nº OTs': number | string;
    'Última Compra': string;
    '--- DETALLE ITEMS ---': string;
    'Fecha Item': string;
    'Proveedor': string;
    'CIF Proveedor': string;
    'OT/CECO': string;
    'Cantidad': number | string;
    'Precio Unitario': number | string;
    'Total Item (c/IVA)': number | string;
    'Nº Factura': string;
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
        'Cantidad': item.quantity.toNumber(),
        'Precio Unitario': item.unitPrice.toNumber(),
        'Total Línea': item.totalPrice.toNumber(),
        'OT/CECO': item.workOrder || '',
        'Fecha Línea': item.itemDate.toLocaleDateString('es-ES')
    }));

    // Ordenar alfabéticamente por nombre de material (A → Z)
    exportData.sort((a, b) => a['Nombre Material'].localeCompare(b['Nombre Material'], 'es', { sensitivity: 'base' }));

    return exportData;
}

// Interface for detailed material analysis
export interface MaterialDetailedExport {
    'Material': string;
    'Código Material': string;
    'Proveedor': string;
    'CIF Proveedor': string;
    'Tipo Proveedor': string;
    'OT/CECO': string;
    'Cantidad': number;
    'Precio Unitario': string;
    'Total Material (s/IVA)': string;
    'Total Material (c/IVA)': string;
    'Fecha Item': string;
    'Nº Factura': string;
    'Fecha Factura': string;
}

// New detailed materials export function
export async function exportMaterialsListDetailed(filters: ExportFilters = {}) {
    const where: Prisma.InvoiceItemWhereInput = buildWhereClause(filters);

    const items = await prisma.invoiceItem.findMany({
        where,
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        },
        orderBy: [
            { material: { name: 'asc' } },
            { invoice: { provider: { name: 'asc' } } },
            { itemDate: 'desc' }
        ]
    });

    if (items.length === 0) {
        return [];
    }

    // Build detailed export data - each material purchase gets its own row
    const exportData: MaterialDetailedExport[] = items.map(item => {
        const basePrice = item.totalPrice.toNumber();
        const priceWithIva = basePrice * 1.21;

        return {
            'Material': item.material.name,
            'Código Material': item.material.code,
            'Proveedor': item.invoice.provider.name,
            'CIF Proveedor': item.invoice.provider.cif,
            'Tipo Proveedor': item.invoice.provider.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
            'OT/CECO': item.workOrder || '',
            'Cantidad': item.quantity.toNumber(),
            'Precio Unitario': item.unitPrice.toNumber().toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 4,
                maximumFractionDigits: 4
            }),
            'Total Material (s/IVA)': basePrice.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            'Total Material (c/IVA)': priceWithIva.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
            'Nº Factura': item.invoice.invoiceCode,
            'Fecha Factura': item.invoice.issueDate.toLocaleDateString('es-ES')
        };
    });

    return exportData.sort((a, b) => a['Material'].localeCompare(b['Material'], 'es', { sensitivity: 'base' }));
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
        const averagePrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;
        const uniqueSuppliers = new Set(materialItems.map(item => item.invoice.providerId));
        const uniqueInvoices = new Set(materialItems.map(item => item.invoiceId));
        const workOrders = [...new Set(materialItems.map(item => item.workOrder).filter(Boolean))];
        const lastPurchase = materialItems.sort((a, b) => b.itemDate.getTime() - a.itemDate.getTime())[0];

        exportData.push({
            'Código Material': material.code,
            'Nombre Material': material.name,
            'Cantidad Total': totalQuantity,
            'Coste Total': totalCost,
            'Precio Promedio': averagePrice,
            'Nº Facturas': uniqueInvoices.size,
            'Nº Proveedores': uniqueSuppliers.size,
            'Última Compra': lastPurchase.itemDate.toLocaleDateString('es-ES'),
            'OTs Asociadas': workOrders.join(', ')
        });
    }

    return exportData.sort((a, b) => a['Nombre Material'].localeCompare(b['Nombre Material'], 'es', { sensitivity: 'base' }));
}

// Interface for detailed supplier analysis
export interface SupplierDetailedExport {
    'Proveedor': string;
    'CIF Proveedor': string;
    'Tipo Proveedor': string;
    'Material': string;
    'Código Material': string;
    'OT/CECO': string;
    'Cantidad': number;
    'Precio Unitario': string;
    'Total Material (s/IVA)': string;
    'Total Material (c/IVA)': string;
    'Fecha Item': string;
    'Nº Factura': string;
    'Fecha Factura': string;
}

// New detailed suppliers export function
export async function exportSuppliersListDetailed(filters: ExportFilters = {}) {
    // Normalize search parameters
    const normalizedSupplierCif = normalizeSearch(filters.supplierCif);

    const where: Prisma.InvoiceItemWhereInput = {
        ...(filters.supplierId ? { invoice: { providerId: filters.supplierId } } : {}),
        ...(normalizedSupplierCif ? { invoice: { provider: { cif: { contains: normalizedSupplierCif, mode: 'insensitive' } } } } : {}),
        ...(filters.startDate || filters.endDate ? {
            invoice: {
                issueDate: {
                    ...(filters.startDate ? { gte: filters.startDate } : {}),
                    ...(filters.endDate ? { lte: filters.endDate } : {})
                }
            }
        } : {}),
        ...(filters.fiscalYear ? {
            invoice: {
                issueDate: {
                    gte: new Date(filters.fiscalYear, 3, 1),
                    lt: new Date(filters.fiscalYear + 1, 3, 1)
                }
            }
        } : {}),
        ...(filters.naturalYear ? {
            invoice: {
                issueDate: {
                    gte: new Date(filters.naturalYear, 0, 1),
                    lt: new Date(filters.naturalYear + 1, 0, 1)
                }
            }
        } : {}),
        ...(filters.workOrder || filters.materialId || filters.category || filters.materialSearch ? {
            ...(processWorkOrderSearch(filters.workOrder) ? { workOrder: { contains: processWorkOrderSearch(filters.workOrder), mode: 'insensitive' } } : {}),
            ...(filters.materialId ? { materialId: filters.materialId } : {}),
            ...(normalizeSearch(filters.category) ? { material: { category: { contains: normalizeSearch(filters.category), mode: 'insensitive' } } } : {}),
            ...(normalizeSearch(filters.materialSearch) ? { material: { name: { contains: normalizeSearch(filters.materialSearch), mode: 'insensitive' } } } : {})
        } : {})
    };

    const items = await prisma.invoiceItem.findMany({
        where,
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        },
        orderBy: [
            { invoice: { provider: { name: 'asc' } } },
            { material: { name: 'asc' } },
            { itemDate: 'desc' }
        ]
    });

    if (items.length === 0) {
        return [];
    }

    // Build detailed export data - each supplier purchase gets its own row
    const exportData: SupplierDetailedExport[] = items.map(item => {
        const basePrice = item.totalPrice.toNumber();
        const priceWithIva = basePrice * 1.21;

        return {
            'Proveedor': item.invoice.provider.name,
            'CIF Proveedor': item.invoice.provider.cif,
            'Tipo Proveedor': item.invoice.provider.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
            'Material': item.material.name,
            'Código Material': item.material.code,
            'OT/CECO': item.workOrder || '',
            'Cantidad': item.quantity.toNumber(),
            'Precio Unitario': item.unitPrice.toNumber().toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 4,
                maximumFractionDigits: 4
            }),
            'Total Material (s/IVA)': basePrice.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            'Total Material (c/IVA)': priceWithIva.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
            'Nº Factura': item.invoice.invoiceCode,
            'Fecha Factura': item.invoice.issueDate.toLocaleDateString('es-ES')
        };
    });

    return exportData.sort((a, b) => a['Material'].localeCompare(b['Material'], 'es', { sensitivity: 'base' }));
}

export async function exportSupplierSummary(filters: ExportFilters = {}) {
    // Normalize search parameters
    const normalizedSupplierCif = normalizeSearch(filters.supplierCif);

    const where: Prisma.InvoiceWhereInput = {
        ...(filters.supplierId ? { providerId: filters.supplierId } : {}),
        ...(normalizedSupplierCif ? { provider: { cif: { contains: normalizedSupplierCif, mode: 'insensitive' } } } : {}),
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
        ...(filters.workOrder || filters.materialId || filters.category || filters.materialSearch ? {
            items: {
                some: {
                    ...(processWorkOrderSearch(filters.workOrder) ? { workOrder: { contains: processWorkOrderSearch(filters.workOrder), mode: 'insensitive' } } : {}),
                    ...(filters.materialId ? { materialId: filters.materialId } : {}),
                    ...(normalizeSearch(filters.category) ? { material: { category: { contains: normalizeSearch(filters.category), mode: 'insensitive' } } } : {}),
                    ...(normalizeSearch(filters.materialSearch) ? { material: { name: { contains: normalizeSearch(filters.materialSearch), mode: 'insensitive' } } } : {})
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

export async function exportSupplierDetail(filters: ExportFilters = {}) {
    const where = buildWhereClause(filters);

    // Get all invoice items with supplier information
    const items = await prisma.invoiceItem.findMany({
        where,
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        },
        orderBy: [
            { invoice: { provider: { name: 'asc' } } },
            { itemDate: 'desc' }
        ]
    });

    const exportData: SupplierDetailExport[] = [];

    // Group items by supplier
    const supplierGroups = items.reduce((acc, item) => {
        const supplierId = item.invoice.providerId;
        if (!acc[supplierId]) {
            acc[supplierId] = {
                supplier: item.invoice.provider,
                items: []
            };
        }
        acc[supplierId].items.push(item);
        return acc;
    }, {} as Record<string, { supplier: Provider, items: (InvoiceItem & { material: Material, invoice: Invoice & { provider: Provider } })[] }>);

    // Process each supplier group
    for (const [supplierId, { supplier, items: supplierItems }] of Object.entries(supplierGroups)) {
        const totalCostBase = supplierItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const totalCost = totalCostBase * 1.21; // Add 21% IVA
        const uniqueInvoices = new Set(supplierItems.map(item => item.invoiceId));
        const uniqueMaterials = new Set(supplierItems.map(item => item.materialId));
        const uniqueWorkOrders = new Set(supplierItems.map(item => item.workOrder).filter(Boolean));
        const averageInvoiceAmount = totalCost / uniqueInvoices.size;
        const lastPurchase = supplierItems.reduce((latest, item) =>
            item.itemDate > latest ? item.itemDate : latest, supplierItems[0].itemDate);

        // Add summary row
        exportData.push({
            'Proveedor': supplier.name,
            'CIF': supplier.cif,
            'Tipo': supplier.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
            '--- RESUMEN ---': '=== RESUMEN ===',
            'Gasto Total (c/IVA)': totalCost,
            'Gasto Base': totalCostBase,
            'IVA': totalCostBase * 0.21,
            'Nº Facturas': uniqueInvoices.size,
            'Nº Items': supplierItems.length,
            'Nº Materiales': uniqueMaterials.size,
            'Nº OTs': uniqueWorkOrders.size,
            'Promedio Factura': averageInvoiceAmount,
            'Última Factura': lastPurchase.toLocaleDateString('es-ES'),
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Material': '',
            'Código Material': '',
            'OT/CECO': '',
            'Cantidad': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });

        // Add item details
        supplierItems.slice(0, 100).forEach((item, index) => { // Limit to prevent huge files
            exportData.push({
                'Proveedor': '',
                'CIF': '',
                'Tipo': '',
                '--- RESUMEN ---': '',
                'Gasto Total (c/IVA)': '',
                'Gasto Base': '',
                'IVA': '',
                'Nº Facturas': '',
                'Nº Items': '',
                'Nº Materiales': '',
                'Nº OTs': '',
                'Promedio Factura': '',
                'Última Factura': '',
                '--- DETALLE ITEMS ---': index === 0 ? '=== ITEMS ===' : '',
                'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
                'Material': item.material.name,
                'Código Material': item.material.code || '',
                'OT/CECO': item.workOrder || '',
                'Cantidad': item.quantity.toNumber(),
                'Precio Unitario': item.unitPrice.toNumber(),
                'Total Item (c/IVA)': item.totalPrice.toNumber() * 1.21,
                'Nº Factura': item.invoice.invoiceCode
            });
        });

        // Add separator row
        exportData.push({
            'Proveedor': '',
            'CIF': '',
            'Tipo': '',
            '--- RESUMEN ---': '',
            'Gasto Total (c/IVA)': '',
            'Gasto Base': '',
            'IVA': '',
            'Nº Facturas': '',
            'Nº Items': '',
            'Nº Materiales': '',
            'Nº OTs': '',
            'Promedio Factura': '',
            'Última Factura': '',
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Material': '',
            'Código Material': '',
            'OT/CECO': '',
            'Cantidad': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });
    }

    return exportData;
}

export async function exportMaterialDetail(filters: ExportFilters = {}) {
    const where = buildWhereClause(filters);

    // Get all invoice items with material information
    const items = await prisma.invoiceItem.findMany({
        where,
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        },
        orderBy: [
            { material: { name: 'asc' } },
            { itemDate: 'desc' }
        ]
    });

    const exportData: MaterialDetailExport[] = [];

    // Group items by material
    const materialGroups = items.reduce((acc, item) => {
        const materialId = item.materialId;
        if (!acc[materialId]) {
            acc[materialId] = {
                material: item.material,
                items: []
            };
        }
        acc[materialId].items.push(item);
        return acc;
    }, {} as Record<string, { material: Material, items: (InvoiceItem & { material: Material, invoice: Invoice & { provider: Provider } })[] }>);

    // Process each material group
    for (const [materialId, { material, items: materialItems }] of Object.entries(materialGroups)) {
        const totalCostBase = materialItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const totalCost = totalCostBase * 1.21; // Add 21% IVA
        const totalQuantity = materialItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
        const uniqueSuppliers = new Set(materialItems.map(item => item.invoice.providerId));
        const uniqueWorkOrders = new Set(materialItems.map(item => item.workOrder).filter(Boolean));
        const averagePrice = totalQuantity > 0 ? totalCostBase / totalQuantity : 0;
        const lastPurchase = materialItems.reduce((latest, item) =>
            item.itemDate > latest ? item.itemDate : latest, materialItems[0].itemDate);

        // Add summary row
        exportData.push({
            'Material': material.name,
            'Código Material': material.code || '',
            'Categoría': material.category || '',
            '--- RESUMEN ---': '=== RESUMEN ===',
            'Coste Total (c/IVA)': totalCost,
            'Coste Base': totalCostBase,
            'IVA': totalCostBase * 0.21,
            'Cantidad Total': totalQuantity,
            'Precio Promedio': averagePrice,
            'Nº Proveedores': uniqueSuppliers.size,
            'Nº Items': materialItems.length,
            'Nº OTs': uniqueWorkOrders.size,
            'Última Compra': lastPurchase.toLocaleDateString('es-ES'),
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Proveedor': '',
            'CIF Proveedor': '',
            'OT/CECO': '',
            'Cantidad': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });

        // Add item details
        materialItems.slice(0, 100).forEach((item, index) => { // Limit to prevent huge files
            exportData.push({
                'Material': '',
                'Código Material': '',
                'Categoría': '',
                '--- RESUMEN ---': '',
                'Coste Total (c/IVA)': '',
                'Coste Base': '',
                'IVA': '',
                'Cantidad Total': '',
                'Precio Promedio': '',
                'Nº Proveedores': '',
                'Nº Items': '',
                'Nº OTs': '',
                'Última Compra': '',
                '--- DETALLE ITEMS ---': index === 0 ? '=== ITEMS ===' : '',
                'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
                'Proveedor': item.invoice.provider.name,
                'CIF Proveedor': item.invoice.provider.cif,
                'OT/CECO': item.workOrder || '',
                'Cantidad': item.quantity.toNumber(),
                'Precio Unitario': item.unitPrice.toNumber(),
                'Total Item (c/IVA)': item.totalPrice.toNumber() * 1.21,
                'Nº Factura': item.invoice.invoiceCode
            });
        });

        // Add separator row
        exportData.push({
            'Material': '',
            'Código Material': '',
            'Categoría': '',
            '--- RESUMEN ---': '',
            'Coste Total (c/IVA)': '',
            'Coste Base': '',
            'IVA': '',
            'Cantidad Total': '',
            'Precio Promedio': '',
            'Nº Proveedores': '',
            'Nº Items': '',
            'Nº OTs': '',
            'Última Compra': '',
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Proveedor': '',
            'CIF Proveedor': '',
            'OT/CECO': '',
            'Cantidad': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });
    }

    return exportData.sort((a, b) => {
        // Sort summary rows before item rows, and by material name
        if (a['Material'] && b['Material']) {
            return a['Material'].localeCompare(b['Material'], 'es', { sensitivity: 'base' });
        }
        if (a['Material']) return -1;
        if (b['Material']) return 1;
        return 0;
    });
}

// Function to export material detail by work order for analytics
export async function exportMaterialDetailByWorkOrder(filters: ExportFilters = {}) {
    const whereClause = buildWhereClause(filters);

    const items = await prisma.invoiceItem.findMany({
        where: {
            ...whereClause,
            workOrder: { not: null } // Only items with work orders
        },
        include: {
            material: true,
            invoice: {
                include: { provider: true }
            }
        },
        orderBy: [
            { workOrder: 'asc' },
            { material: { name: 'asc' } },
            { itemDate: 'desc' },
            { lineNumber: 'asc' }
        ]
    });

    // Group by work order and then by material
    const workOrderGroups = new Map<string, Map<string, typeof items>>();

    for (const item of items) {
        const workOrder = item.workOrder!;
        const materialId = item.materialId;

        if (!workOrderGroups.has(workOrder)) {
            workOrderGroups.set(workOrder, new Map());
        }

        const materialGroups = workOrderGroups.get(workOrder)!;
        if (!materialGroups.has(materialId)) {
            materialGroups.set(materialId, []);
        }
        materialGroups.get(materialId)!.push(item);
    }

    const exportData: WorkOrderByMaterialDetailExport[] = [];

    // Sort work orders for consistent output
    const sortedWorkOrders = Array.from(workOrderGroups.keys()).sort();

    for (const workOrder of sortedWorkOrders) {
        const materialGroups = workOrderGroups.get(workOrder)!;

        // Sort materials within each work order
        const sortedMaterials = Array.from(materialGroups.keys()).sort((a, b) => {
            const materialA = materialGroups.get(a)![0].material.name;
            const materialB = materialGroups.get(b)![0].material.name;
            return materialA.localeCompare(materialB, 'es', { sensitivity: 'base' });
        });

        for (const materialId of sortedMaterials) {
            const materialItems = materialGroups.get(materialId)!;
            const material = materialItems[0].material;
            const totalCostBase = materialItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
            const totalCostWithIva = totalCostBase * 1.21;
            const iva = totalCostBase * 0.21;
            const totalQuantity = materialItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
            const averagePrice = totalQuantity > 0 ? totalCostBase / totalQuantity : 0;
            const uniqueProviders = new Set(materialItems.map(item => item.invoice.provider.name));

            // Add summary row
            exportData.push({
                'Orden de Trabajo': workOrder,
                'Material': material.name,
                'Código Material': material.code,
                '--- RESUMEN ---': '=== RESUMEN ===',
                'Coste Total (c/IVA)': totalCostWithIva,
                'Coste Base': totalCostBase,
                'IVA': iva,
                'Cantidad Total': totalQuantity,
                'Precio Promedio': averagePrice,
                'Nº Proveedores': uniqueProviders.size,
                'Nº Items': materialItems.length,
                '--- DETALLE ITEMS ---': '',
                'Fecha Item': '',
                'Proveedor': '',
                'Cantidad Item': '',
                'Precio Unitario': '',
                'Total Item (c/IVA)': '',
                'Nº Factura': ''
            });

            // Add items details
            materialItems.sort((a, b) => new Date(b.itemDate).getTime() - new Date(a.itemDate).getTime())
                .forEach((item, index) => {
                    exportData.push({
                        'Orden de Trabajo': '',
                        'Material': '',
                        'Código Material': '',
                        '--- RESUMEN ---': '',
                        'Coste Total (c/IVA)': '',
                        'Coste Base': '',
                        'IVA': '',
                        'Cantidad Total': '',
                        'Precio Promedio': '',
                        'Nº Proveedores': '',
                        'Nº Items': '',
                        '--- DETALLE ITEMS ---': index === 0 ? '=== ITEMS ===' : '',
                        'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
                        'Proveedor': item.invoice.provider.name,
                        'Cantidad Item': item.quantity.toNumber(),
                        'Precio Unitario': item.unitPrice.toNumber(),
                        'Total Item (c/IVA)': item.totalPrice.toNumber() * 1.21,
                        'Nº Factura': item.invoice.invoiceCode
                    });
                });

            // Add separator row
            exportData.push({
                'Orden de Trabajo': '',
                'Material': '',
                'Código Material': '',
                '--- RESUMEN ---': '',
                'Coste Total (c/IVA)': '',
                'Coste Base': '',
                'IVA': '',
                'Cantidad Total': '',
                'Precio Promedio': '',
                'Nº Proveedores': '',
                'Nº Items': '',
                '--- DETALLE ITEMS ---': '',
                'Fecha Item': '',
                'Proveedor': '',
                'Cantidad Item': '',
                'Precio Unitario': '',
                'Total Item (c/IVA)': '',
                'Nº Factura': ''
            });
        }
    }

    return exportData;
}

export async function generateExcelReport(filters: ExportFilters = {}, includeDetails = true) {
    const workbook = XLSX.utils.book_new();

    // Check if this is a specific list export from dedicated pages
    const isWorkOrdersListExport = filters.exportType === 'workorders-list';
    const isMaterialsListExport = filters.exportType === 'materials-list';
    const isSuppliersListExport = filters.exportType === 'suppliers-list';

    // If this is a work orders list export, create work orders summary and detailed sheets
    if (isWorkOrdersListExport) {
        // First sheet: Summary by work order (one row per work order)
        const workOrdersSummary = await exportWorkOrdersListSummary(filters);
        if (workOrdersSummary.length > 0) {
            const summarySheet = createStyledWorksheet(workOrdersSummary, [
                { wch: 20 }, // Orden de Trabajo
                { wch: 18 }, // Coste Total (c/IVA)
                { wch: 18 }, // Coste Base Imponible
                { wch: 15 }, // IVA (21%)
                { wch: 12 }, // Total Items
                { wch: 15 }, // Cantidad Total
                { wch: 15 }, // Nº Proveedores
                { wch: 15 }, // Nº Materiales
                { wch: 12 }, // Fecha Inicio
                { wch: 12 }, // Fecha Fin
                { wch: 15 }  // Periodo (días)
            ]);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen por OT');
        }

        // Second sheet: Detailed breakdown (each material purchase gets its own row)
        const workOrdersDetailed = await exportWorkOrdersListDetailed(filters);
        if (workOrdersDetailed.length > 0) {
            const detailedSheet = createStyledWorksheet(workOrdersDetailed, [
                { wch: 20 }, // Código OT
                { wch: 25 }, // Proveedor
                { wch: 15 }, // CIF Proveedor
                { wch: 18 }, // Tipo Proveedor
                { wch: 35 }, // Material
                { wch: 15 }, // Código Material
                { wch: 12 }, // Cantidad
                { wch: 15 }, // Precio Unitario
                { wch: 18 }, // Total Material (s/IVA)
                { wch: 18 }, // Total Material (c/IVA)
                { wch: 12 }, // Fecha Item
                { wch: 15 }, // Nº Factura
                { wch: 12 }  // Fecha Factura
            ]);
            XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Detalle por Material');
        }
    }
    // If this is a materials list export, create materials detailed analysis
    else if (isMaterialsListExport) {
        const materialsData = await exportMaterialsListDetailed(filters);
        if (materialsData.length > 0) {
            const materialsSheet = createStyledWorksheet(materialsData, [
                { wch: 35 }, // Material
                { wch: 15 }, // Código Material
                { wch: 25 }, // Proveedor
                { wch: 15 }, // CIF Proveedor
                { wch: 18 }, // Tipo Proveedor
                { wch: 15 }, // OT/CECO
                { wch: 12 }, // Cantidad
                { wch: 15 }, // Precio Unitario
                { wch: 18 }, // Total Material (s/IVA)
                { wch: 18 }, // Total Material (c/IVA)
                { wch: 12 }, // Fecha Item
                { wch: 15 }, // Nº Factura
                { wch: 12 }  // Fecha Factura
            ]);
            XLSX.utils.book_append_sheet(workbook, materialsSheet, 'Análisis Detallado Materiales');
        }
    }
    // If this is a suppliers list export, create suppliers detailed analysis
    else if (isSuppliersListExport) {
        const suppliersData = await exportSuppliersListDetailed(filters);
        if (suppliersData.length > 0) {
            const suppliersSheet = createStyledWorksheet(suppliersData, [
                { wch: 25 }, // Proveedor
                { wch: 15 }, // CIF Proveedor
                { wch: 18 }, // Tipo Proveedor
                { wch: 35 }, // Material
                { wch: 15 }, // Código Material
                { wch: 15 }, // OT/CECO
                { wch: 12 }, // Cantidad
                { wch: 15 }, // Precio Unitario
                { wch: 18 }, // Total Material (s/IVA)
                { wch: 18 }, // Total Material (c/IVA)
                { wch: 12 }, // Fecha Item
                { wch: 15 }, // Nº Factura
                { wch: 12 }  // Fecha Factura
            ]);
            XLSX.utils.book_append_sheet(workbook, suppliersSheet, 'Análisis Detallado Proveedores');
        }
    }
    // If this is a work order specific export, create comprehensive work order sheets
    else if (filters.workOrder && filters.workOrder.match(/^[A-Za-z0-9-_]+$/)) {
        const workOrder = filters.workOrder;

        // 1. Analysis by Provider Sheet (with detailed items)
        const providerData = await exportWorkOrderByProvider(workOrder);
        if (providerData.length > 0) {
            const providerSheet = createStyledWorksheet(providerData, [
                { wch: 20 }, // Orden de Trabajo
                { wch: 25 }, // Proveedor
                { wch: 15 }, // CIF Proveedor
                { wch: 18 }, // Tipo Proveedor
                { wch: 15 }, // --- RESUMEN ---
                { wch: 15 }, // Coste Total (c/IVA)
                { wch: 15 }, // Coste Base
                { wch: 12 }, // IVA
                { wch: 12 }, // Total Items
                { wch: 15 }, // Cantidad Total
                { wch: 12 }, // Nº Materiales
                { wch: 18 }, // --- DETALLE ITEMS ---
                { wch: 12 }, // Fecha Item
                { wch: 30 }, // Material
                { wch: 15 }, // Código Material
                { wch: 12 }, // Cantidad Item
                { wch: 15 }, // Precio Unitario
                { wch: 15 }, // Total Item (c/IVA)
                { wch: 15 }  // Nº Factura
            ]);
            XLSX.utils.book_append_sheet(workbook, providerSheet, 'Por Proveedor');
        }

        // 2. Analysis by Material Sheet (with detailed items)
        const materialData = await exportWorkOrderByMaterial(workOrder);
        if (materialData.length > 0) {
            const materialSheet = createStyledWorksheet(materialData, [
                { wch: 20 }, // Orden de Trabajo
                { wch: 30 }, // Material
                { wch: 15 }, // Código Material
                { wch: 15 }, // --- RESUMEN ---
                { wch: 15 }, // Coste Total (c/IVA)
                { wch: 15 }, // Coste Base
                { wch: 12 }, // IVA
                { wch: 15 }, // Cantidad Total
                { wch: 15 }, // Precio Promedio
                { wch: 12 }, // Nº Proveedores
                { wch: 12 }, // Nº Items
                { wch: 18 }, // --- DETALLE ITEMS ---
                { wch: 12 }, // Fecha Item
                { wch: 25 }, // Proveedor
                { wch: 12 }, // Cantidad Item
                { wch: 15 }, // Precio Unitario
                { wch: 15 }, // Total Item (c/IVA)
                { wch: 15 }  // Nº Factura
            ]);
            XLSX.utils.book_append_sheet(workbook, materialSheet, 'Por Material');
        }

        // 3. Analysis by Month Sheet (with detailed items)
        const monthData = await exportWorkOrderByMonth(workOrder);
        if (monthData.length > 0) {
            const monthSheet = createStyledWorksheet(monthData, [
                { wch: 20 }, // Orden de Trabajo
                { wch: 8 },  // Año
                { wch: 8 },  // Mes
                { wch: 20 }, // Mes Nombre
                { wch: 15 }, // --- RESUMEN ---
                { wch: 15 }, // Coste Total (c/IVA)
                { wch: 15 }, // Coste Base
                { wch: 12 }, // IVA
                { wch: 12 }, // Total Items
                { wch: 15 }, // Cantidad Total
                { wch: 12 }, // Nº Proveedores
                { wch: 12 }, // Nº Materiales
                { wch: 18 }, // --- DETALLE ITEMS ---
                { wch: 12 }, // Fecha Item
                { wch: 30 }, // Material
                { wch: 15 }, // Código Material
                { wch: 25 }, // Proveedor
                { wch: 12 }, // Cantidad Item
                { wch: 15 }, // Precio Unitario
                { wch: 15 }, // Total Item (c/IVA)
                { wch: 15 }  // Nº Factura
            ]);
            XLSX.utils.book_append_sheet(workbook, monthSheet, 'Por Mes');
        }

        // 4. Detailed Items Sheet
        if (includeDetails) {
            const detailData = await exportDetailedInvoiceData(filters);
            if (detailData.length > 0) {
                const detailSheet = createStyledWorksheet(detailData, [
                    { wch: 15 }, // Código Factura
                    { wch: 25 }, // Proveedor
                    { wch: 15 }, // CIF Proveedor
                    { wch: 18 }, // Tipo Proveedor
                    { wch: 12 }, // Fecha Factura
                    { wch: 15 }, // Total Factura
                    { wch: 15 }, // Código Material
                    { wch: 30 }, // Nombre Material
                    { wch: 12 }, // Cantidad
                    { wch: 15 }, // Precio Unitario
                    { wch: 15 }, // Total Línea
                    { wch: 15 }, // OT/CECO
                    { wch: 12 }  // Fecha Línea
                ]);
                XLSX.utils.book_append_sheet(workbook, detailSheet, 'Items Detallados');
            }
        }
    } else {
        // Enhanced general export logic with detailed analysis

        // Determine if this is a supplier-focused or material-focused export
        const isSupplierFocused = filters.supplierId || filters.supplierCif || filters.supplierType;
        const isMaterialFocused = filters.materialId || filters.category || filters.materialSearch;

        if (isSupplierFocused) {
            // Enhanced supplier export with detailed analysis
            const supplierDetailData = await exportSuppliersListDetailed(filters);
            if (supplierDetailData.length > 0) {
                const supplierDetailSheet = createStyledWorksheet(supplierDetailData, [
                    { wch: 25 }, // Proveedor
                    { wch: 15 }, // CIF Proveedor
                    { wch: 18 }, // Tipo Proveedor
                    { wch: 35 }, // Material
                    { wch: 15 }, // Código Material
                    { wch: 15 }, // OT/CECO
                    { wch: 12 }, // Cantidad
                    { wch: 15 }, // Precio Unitario
                    { wch: 18 }, // Total Material (s/IVA)
                    { wch: 18 }, // Total Material (c/IVA)
                    { wch: 12 }, // Fecha Item
                    { wch: 15 }, // Nº Factura
                    { wch: 12 }  // Fecha Factura
                ]);
                XLSX.utils.book_append_sheet(workbook, supplierDetailSheet, 'Análisis Detallado Proveedores');
            }
        } else if (isMaterialFocused) {
            // Enhanced material export with detailed analysis
            const materialDetailData = await exportMaterialsListDetailed(filters);
            if (materialDetailData.length > 0) {
                const materialDetailSheet = createStyledWorksheet(materialDetailData, [
                    { wch: 35 }, // Material
                    { wch: 15 }, // Código Material
                    { wch: 25 }, // Proveedor
                    { wch: 15 }, // CIF Proveedor
                    { wch: 18 }, // Tipo Proveedor
                    { wch: 15 }, // OT/CECO
                    { wch: 12 }, // Cantidad
                    { wch: 15 }, // Precio Unitario
                    { wch: 18 }, // Total Material (s/IVA)
                    { wch: 18 }, // Total Material (c/IVA)
                    { wch: 12 }, // Fecha Item
                    { wch: 15 }, // Nº Factura
                    { wch: 12 }  // Fecha Factura
                ]);
                XLSX.utils.book_append_sheet(workbook, materialDetailSheet, 'Análisis Detallado Materiales');
            }
        } else {
            // General export with both detailed analyses

            // Add detailed supplier analysis
            const supplierDetailData = await exportSuppliersListDetailed(filters);
            if (supplierDetailData.length > 0) {
                const supplierDetailSheet = createStyledWorksheet(supplierDetailData, [
                    { wch: 25 }, // Proveedor
                    { wch: 15 }, // CIF Proveedor
                    { wch: 18 }, // Tipo Proveedor
                    { wch: 35 }, // Material
                    { wch: 15 }, // Código Material
                    { wch: 15 }, // OT/CECO
                    { wch: 12 }, // Cantidad
                    { wch: 15 }, // Precio Unitario
                    { wch: 18 }, // Total Material (s/IVA)
                    { wch: 18 }, // Total Material (c/IVA)
                    { wch: 12 }, // Fecha Item
                    { wch: 15 }, // Nº Factura
                    { wch: 12 }  // Fecha Factura
                ]);
                XLSX.utils.book_append_sheet(workbook, supplierDetailSheet, 'Análisis Detallado Proveedores');
            }

            // Add detailed material analysis
            const materialDetailData = await exportMaterialsListDetailed(filters);
            if (materialDetailData.length > 0) {
                const materialDetailSheet = createStyledWorksheet(materialDetailData, [
                    { wch: 35 }, // Material
                    { wch: 15 }, // Código Material
                    { wch: 25 }, // Proveedor
                    { wch: 15 }, // CIF Proveedor
                    { wch: 18 }, // Tipo Proveedor
                    { wch: 15 }, // OT/CECO
                    { wch: 12 }, // Cantidad
                    { wch: 15 }, // Precio Unitario
                    { wch: 18 }, // Total Material (s/IVA)
                    { wch: 18 }, // Total Material (c/IVA)
                    { wch: 12 }, // Fecha Item
                    { wch: 15 }, // Nº Factura
                    { wch: 12 }  // Fecha Factura
                ]);
                XLSX.utils.book_append_sheet(workbook, materialDetailSheet, 'Análisis Detallado Materiales');
            }
        }

        // Add detailed data if requested (always available for general exports)
        if (includeDetails) {
            // For analytics exports, use "Detalle por Material" by OT instead of "Items Detallados"
            if (filters.exportType === 'analytics') {
                const materialDetailByOTData = await exportMaterialDetailByWorkOrder(filters);
                if (materialDetailByOTData.length > 0) {
                    const materialDetailByOTSheet = createStyledWorksheet(materialDetailByOTData, [
                        { wch: 20 }, // Orden de Trabajo
                        { wch: 30 }, // Material
                        { wch: 15 }, // Código Material
                        { wch: 15 }, // --- RESUMEN ---
                        { wch: 15 }, // Coste Total (c/IVA)
                        { wch: 15 }, // Coste Base
                        { wch: 12 }, // IVA
                        { wch: 15 }, // Cantidad Total
                        { wch: 15 }, // Precio Promedio
                        { wch: 12 }, // Nº Proveedores
                        { wch: 12 }, // Nº Items
                        { wch: 18 }, // --- DETALLE ITEMS ---
                        { wch: 12 }, // Fecha Item
                        { wch: 25 }, // Proveedor
                        { wch: 12 }, // Cantidad Item
                        { wch: 15 }, // Precio Unitario
                        { wch: 15 }, // Total Item (c/IVA)
                        { wch: 15 }  // Nº Factura
                    ]);
                    XLSX.utils.book_append_sheet(workbook, materialDetailByOTSheet, 'Detalle por Material');
                }
            } else {
                // Default behavior: use "Items Detallados"
                const detailData = await exportDetailedInvoiceData(filters);
                if (detailData.length > 0) {
                    const detailSheet = createStyledWorksheet(detailData, [
                        { wch: 15 }, // Código Factura
                        { wch: 25 }, // Proveedor
                        { wch: 15 }, // CIF Proveedor
                        { wch: 18 }, // Tipo Proveedor
                        { wch: 12 }, // Fecha Factura
                        { wch: 15 }, // Total Factura
                        { wch: 15 }, // Código Material
                        { wch: 30 }, // Nombre Material
                        { wch: 12 }, // Cantidad
                        { wch: 15 }, // Precio Unitario
                        { wch: 15 }, // Total Línea
                        { wch: 15 }, // OT/CECO
                        { wch: 12 }  // Fecha Línea
                    ]);
                    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Items Detallados');
                }
            }
        }
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    return buffer;
}

function buildWhereClause(filters: ExportFilters): Prisma.InvoiceItemWhereInput {
    // Normalize search parameters
    const normalizedCategory = normalizeSearch(filters.category);
    const normalizedMaterialSearch = normalizeSearch(filters.materialSearch);
    const normalizedWorkOrder = processWorkOrderSearch(filters.workOrder);
    const normalizedSupplierCif = normalizeSearch(filters.supplierCif);

    return {
        ...(filters.materialId ? { materialId: filters.materialId } : {}),
        ...(normalizedCategory ? { material: { category: { contains: normalizedCategory, mode: 'insensitive' } } } : {}),
        ...(normalizedMaterialSearch ? { material: { name: { contains: normalizedMaterialSearch, mode: 'insensitive' } } } : {}),
        ...(normalizedWorkOrder ? { workOrder: { contains: normalizedWorkOrder, mode: 'insensitive' } } : {}),
        ...(filters.supplierId ? { invoice: { providerId: filters.supplierId } } : {}),
        ...(normalizedSupplierCif ? { invoice: { provider: { cif: { contains: normalizedSupplierCif, mode: 'insensitive' } } } } : {}),
        ...(filters.supplierType ? { invoice: { provider: { type: filters.supplierType as ProviderType } } } : {}),
        ...(filters.minPrice ? { unitPrice: { gte: filters.minPrice } } : {}),
        ...(filters.maxPrice ? { unitPrice: { lte: filters.maxPrice } } : {}),
        ...(filters.minUnitPrice ? { unitPrice: { gte: filters.minUnitPrice } } : {}),
        ...(filters.maxUnitPrice ? { unitPrice: { lte: filters.maxUnitPrice } } : {}),
        ...(filters.minTotalCost ? { totalPrice: { gte: filters.minTotalCost } } : {}),
        ...(filters.maxTotalCost ? { totalPrice: { lte: filters.maxTotalCost } } : {}),
        ...(filters.minQuantity ? { quantity: { gte: filters.minQuantity } } : {}),
        ...(filters.maxQuantity ? { quantity: { lte: filters.maxQuantity } } : {}),
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

// Interface for detailed work order analysis with material breakdown
export interface WorkOrderDetailedExport {
    'Código OT': string;
    'Proveedor': string;
    'CIF Proveedor': string;
    'Tipo Proveedor': string;
    'Material': string;
    'Código Material': string;
    'Cantidad': number;
    'Precio Unitario': string;
    'Total Material (s/IVA)': string;
    'Total Material (c/IVA)': string;
    'Fecha Item': string;
    'Nº Factura': string;
    'Fecha Factura': string;
}

export async function exportWorkOrdersListSummary(filters: ExportFilters = {}) {
    // Build where clause exactly like the work orders page
    const normalizedSearch = normalizeSearch(filters.workOrder);

    const baseWhere: Prisma.InvoiceItemWhereInput = {
        workOrder: {
            not: null,
            ...(normalizedSearch && { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive })
        },
        ...(filters.supplierId && filters.supplierId !== 'all' && {
            invoice: {
                providerId: filters.supplierId
            }
        })
    };

    // First, get work order aggregations for summary
    const workOrderAggregation = await prisma.invoiceItem.groupBy({
        by: ['workOrder'],
        where: baseWhere,
        _sum: {
            totalPrice: true,
            quantity: true
        },
        _count: {
            id: true
        },
        _min: {
            itemDate: true
        },
        _max: {
            itemDate: true
        },
        orderBy: {
            _sum: { totalPrice: 'desc' }
        }
    });

    if (workOrderAggregation.length === 0) {
        return [];
    }

    // Get work order codes
    const workOrderCodes = workOrderAggregation.map(wo => wo.workOrder!).filter(Boolean);

    // Get all items for these work orders to calculate additional stats
    const allItems = await prisma.invoiceItem.findMany({
        where: {
            ...baseWhere,
            workOrder: { in: workOrderCodes }
        },
        include: {
            material: true,
            invoice: {
                include: {
                    provider: true
                }
            }
        }
    });

    // Group items by work order for detailed calculations
    const itemsByWorkOrder = new Map<string, typeof allItems>();
    for (const item of allItems) {
        const workOrder = item.workOrder!;
        if (!itemsByWorkOrder.has(workOrder)) {
            itemsByWorkOrder.set(workOrder, []);
        }
        itemsByWorkOrder.get(workOrder)!.push(item);
    }

    // Build summary export data - one row per work order
    const exportData: WorkOrderSummaryExport[] = workOrderAggregation.map(wo => {
        const workOrderCode = wo.workOrder!;
        const items = itemsByWorkOrder.get(workOrderCode) || [];

        const totalCostBase = wo._sum?.totalPrice?.toNumber() || 0;
        const totalCostWithIva = totalCostBase * 1.21;
        const iva = totalCostBase * 0.21;

        const uniqueProviders = [...new Set(items.map(item => item.invoice.provider.id))];
        const uniqueMaterials = [...new Set(items.map(item => item.material.id))];

        const minDate = wo._min?.itemDate || new Date();
        const maxDate = wo._max?.itemDate || new Date();
        const periodDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
            'Orden de Trabajo': workOrderCode,
            'Coste Total (c/IVA)': totalCostWithIva,
            'Coste Base Imponible': totalCostBase,
            'IVA (21%)': iva,
            'Total Items': wo._count?.id || 0,
            'Cantidad Total': wo._sum?.quantity?.toNumber() || 0,
            'Nº Proveedores': uniqueProviders.length,
            'Nº Materiales': uniqueMaterials.length,
            'Fecha Inicio': minDate.toLocaleDateString('es-ES'),
            'Fecha Fin': maxDate.toLocaleDateString('es-ES'),
            'Periodo (días)': periodDays
        };
    });

    return exportData;
}

export async function exportWorkOrdersListDetailed(filters: ExportFilters = {}) {
    // Build where clause exactly like the work orders page
    const normalizedSearch = normalizeSearch(filters.workOrder);

    const baseWhere: Prisma.InvoiceItemWhereInput = {
        workOrder: {
            not: null,
            ...(normalizedSearch && { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive })
        },
        ...(filters.supplierId && filters.supplierId !== 'all' && {
            invoice: {
                providerId: filters.supplierId
            }
        })
    };

    // Get ALL invoice items with full details for analysis
    const allItems = await prisma.invoiceItem.findMany({
        where: baseWhere,
        include: {
            material: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    category: true
                }
            },
            invoice: {
                select: {
                    id: true,
                    invoiceCode: true,
                    issueDate: true,
                    provider: {
                        select: {
                            id: true,
                            name: true,
                            cif: true,
                            type: true
                        }
                    }
                }
            }
        },
        orderBy: [
            { workOrder: 'asc' },
            { invoice: { provider: { name: 'asc' } } },
            { material: { name: 'asc' } },
            { itemDate: 'desc' }
        ]
    });

    if (allItems.length === 0) {
        return [];
    }

    // Build detailed export data - each material gets its own row
    const exportData: WorkOrderDetailedExport[] = allItems.map(item => {
        const basePrice = item.totalPrice.toNumber();
        const priceWithIva = basePrice * 1.21;

        return {
            'Código OT': item.workOrder || '',
            'Proveedor': item.invoice.provider.name,
            'CIF Proveedor': item.invoice.provider.cif,
            'Tipo Proveedor': item.invoice.provider.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
            'Material': item.material.name,
            'Código Material': item.material.code,
            'Cantidad': item.quantity.toNumber(),
            'Precio Unitario': item.unitPrice.toNumber().toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 4,
                maximumFractionDigits: 4
            }),
            'Total Material (s/IVA)': basePrice.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            'Total Material (c/IVA)': priceWithIva.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
            'Nº Factura': item.invoice.invoiceCode,
            'Fecha Factura': item.invoice.issueDate.toLocaleDateString('es-ES')
        };
    });

    return exportData.sort((a, b) => a['Material'].localeCompare(b['Material'], 'es', { sensitivity: 'base' }));
}

export async function exportWorkOrderSummary(workOrder: string) {
    const items = await prisma.invoiceItem.findMany({
        where: { workOrder: decodeURIComponent(workOrder) },
        include: {
            material: true,
            invoice: {
                include: { provider: true }
            }
        }
    });

    if (items.length === 0) return [];

    const totalCostBase = items.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
    const totalCostWithIva = totalCostBase * 1.21;
    const iva = totalCostBase * 0.21;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
    const uniqueProviders = new Set(items.map(item => item.invoice.providerId));
    const uniqueMaterials = new Set(items.map(item => item.materialId));

    const dates = items.map(item => item.itemDate).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    return [{
        'Orden de Trabajo': decodeURIComponent(workOrder),
        'Coste Total (c/IVA)': totalCostWithIva,
        'Coste Base Imponible': totalCostBase,
        'IVA (21%)': iva,
        'Total Items': items.length,
        'Cantidad Total': totalQuantity,
        'Nº Proveedores': uniqueProviders.size,
        'Nº Materiales': uniqueMaterials.size,
        'Fecha Inicio': startDate.toLocaleDateString('es-ES'),
        'Fecha Fin': endDate.toLocaleDateString('es-ES'),
        'Periodo (días)': periodDays
    }];
}

export async function exportWorkOrderByProvider(workOrder: string) {
    const items = await prisma.invoiceItem.findMany({
        where: { workOrder: decodeURIComponent(workOrder) },
        include: {
            material: true,
            invoice: {
                include: { provider: true }
            }
        },
        orderBy: [
            { invoice: { provider: { name: 'asc' } } },
            { itemDate: 'desc' },
            { lineNumber: 'asc' }
        ]
    });

    const providerGroups = new Map<string, typeof items>();

    for (const item of items) {
        const providerId = item.invoice.providerId;
        if (!providerGroups.has(providerId)) {
            providerGroups.set(providerId, []);
        }
        providerGroups.get(providerId)!.push(item);
    }

    const exportData: WorkOrderByProviderDetailExport[] = [];

    for (const [providerId, providerItems] of providerGroups) {
        const provider = providerItems[0].invoice.provider;
        const totalCostBase = providerItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const totalCostWithIva = totalCostBase * 1.21;
        const iva = totalCostBase * 0.21;
        const totalQuantity = providerItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
        const uniqueMaterials = new Set(providerItems.map(item => item.materialId));

        // Add summary row
        exportData.push({
            'Orden de Trabajo': decodeURIComponent(workOrder),
            'Proveedor': provider.name,
            'CIF Proveedor': provider.cif,
            'Tipo Proveedor': provider.type === 'MATERIAL_SUPPLIER' ? 'Suministro Material' : 'Alquiler Maquinaria',
            '--- RESUMEN ---': '=== RESUMEN ===',
            'Coste Total (c/IVA)': totalCostWithIva,
            'Coste Base': totalCostBase,
            'IVA': iva,
            'Total Items': providerItems.length,
            'Cantidad Total': totalQuantity,
            'Nº Materiales': uniqueMaterials.size,
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Material': '',
            'Código Material': '',
            'Cantidad Item': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });

        // Add items details
        providerItems.sort((a, b) => a.material.name.localeCompare(b.material.name, 'es', { sensitivity: 'base' }))
            .forEach((item, index) => {
                exportData.push({
                    'Orden de Trabajo': index === 0 ? '' : '', // Only show on first item
                    'Proveedor': '',
                    'CIF Proveedor': '',
                    'Tipo Proveedor': '',
                    '--- RESUMEN ---': '',
                    'Coste Total (c/IVA)': '',
                    'Coste Base': '',
                    'IVA': '',
                    'Total Items': '',
                    'Cantidad Total': '',
                    'Nº Materiales': '',
                    '--- DETALLE ITEMS ---': index === 0 ? '=== ITEMS ===' : '',
                    'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
                    'Material': item.material.name,
                    'Código Material': item.material.code,
                    'Cantidad Item': item.quantity.toNumber(),
                    'Precio Unitario': item.unitPrice.toNumber(),
                    'Total Item (c/IVA)': item.totalPrice.toNumber() * 1.21,
                    'Nº Factura': item.invoice.invoiceCode
                });
            });

        // Add separator row
        exportData.push({
            'Orden de Trabajo': '',
            'Proveedor': '',
            'CIF Proveedor': '',
            'Tipo Proveedor': '',
            '--- RESUMEN ---': '',
            'Coste Total (c/IVA)': '',
            'Coste Base': '',
            'IVA': '',
            'Total Items': '',
            'Cantidad Total': '',
            'Nº Materiales': '',
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Material': '',
            'Código Material': '',
            'Cantidad Item': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });
    }

    return exportData;
}

export async function exportWorkOrderByMaterial(workOrder: string) {
    const items = await prisma.invoiceItem.findMany({
        where: { workOrder: decodeURIComponent(workOrder) },
        include: {
            material: true,
            invoice: {
                include: { provider: true }
            }
        },
        orderBy: [
            { material: { name: 'asc' } },
            { itemDate: 'desc' },
            { lineNumber: 'asc' }
        ]
    });

    const materialGroups = new Map<string, typeof items>();

    for (const item of items) {
        const materialId = item.materialId;
        if (!materialGroups.has(materialId)) {
            materialGroups.set(materialId, []);
        }
        materialGroups.get(materialId)!.push(item);
    }

    const exportData: WorkOrderByMaterialDetailExport[] = [];

    for (const [materialId, materialItems] of materialGroups) {
        const material = materialItems[0].material;
        const totalCostBase = materialItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const totalCostWithIva = totalCostBase * 1.21;
        const iva = totalCostBase * 0.21;
        const totalQuantity = materialItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
        const averagePrice = totalQuantity > 0 ? totalCostBase / totalQuantity : 0;
        const uniqueProviders = new Set(materialItems.map(item => item.invoice.provider.name));

        // Add summary row
        exportData.push({
            'Orden de Trabajo': decodeURIComponent(workOrder),
            'Material': material.name,
            'Código Material': material.code,
            '--- RESUMEN ---': '=== RESUMEN ===',
            'Coste Total (c/IVA)': totalCostWithIva,
            'Coste Base': totalCostBase,
            'IVA': iva,
            'Cantidad Total': totalQuantity,
            'Precio Promedio': averagePrice,
            'Nº Proveedores': uniqueProviders.size,
            'Nº Items': materialItems.length,
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Proveedor': '',
            'Cantidad Item': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });

        // Add items details
        materialItems.sort((a, b) => new Date(b.itemDate).getTime() - new Date(a.itemDate).getTime())
            .forEach((item, index) => {
                exportData.push({
                    'Orden de Trabajo': '',
                    'Material': '',
                    'Código Material': '',
                    '--- RESUMEN ---': '',
                    'Coste Total (c/IVA)': '',
                    'Coste Base': '',
                    'IVA': '',
                    'Cantidad Total': '',
                    'Precio Promedio': '',
                    'Nº Proveedores': '',
                    'Nº Items': '',
                    '--- DETALLE ITEMS ---': index === 0 ? '=== ITEMS ===' : '',
                    'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
                    'Proveedor': item.invoice.provider.name,
                    'Cantidad Item': item.quantity.toNumber(),
                    'Precio Unitario': item.unitPrice.toNumber(),
                    'Total Item (c/IVA)': item.totalPrice.toNumber() * 1.21,
                    'Nº Factura': item.invoice.invoiceCode
                });
            });

        // Add separator row
        exportData.push({
            'Orden de Trabajo': '',
            'Material': '',
            'Código Material': '',
            '--- RESUMEN ---': '',
            'Coste Total (c/IVA)': '',
            'Coste Base': '',
            'IVA': '',
            'Cantidad Total': '',
            'Precio Promedio': '',
            'Nº Proveedores': '',
            'Nº Items': '',
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Proveedor': '',
            'Cantidad Item': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });
    }

    return exportData;
}

export async function exportWorkOrderByMonth(workOrder: string) {
    const items = await prisma.invoiceItem.findMany({
        where: { workOrder: decodeURIComponent(workOrder) },
        include: {
            material: true,
            invoice: {
                include: { provider: true }
            }
        },
        orderBy: [
            { itemDate: 'asc' },
            { lineNumber: 'asc' }
        ]
    });

    const monthGroups = new Map<string, typeof items>();

    for (const item of items) {
        const monthKey = item.itemDate.toISOString().substring(0, 7); // YYYY-MM
        if (!monthGroups.has(monthKey)) {
            monthGroups.set(monthKey, []);
        }
        monthGroups.get(monthKey)!.push(item);
    }

    const exportData: WorkOrderByMonthDetailExport[] = [];

    // Sort months chronologically
    const sortedMonths = Array.from(monthGroups.keys()).sort();

    for (const monthKey of sortedMonths) {
        const monthItems = monthGroups.get(monthKey)!;
        const date = new Date(monthKey + '-01');
        const totalCostBase = monthItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const totalCostWithIva = totalCostBase * 1.21;
        const iva = totalCostBase * 0.21;
        const totalQuantity = monthItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
        const uniqueProviders = new Set(monthItems.map(item => item.invoice.providerId));
        const uniqueMaterials = new Set(monthItems.map(item => item.materialId));

        // Add summary row
        exportData.push({
            'Orden de Trabajo': decodeURIComponent(workOrder),
            'Año': date.getFullYear(),
            'Mes': date.getMonth() + 1,
            'Mes Nombre': date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
            '--- RESUMEN ---': '=== RESUMEN ===',
            'Coste Total (c/IVA)': totalCostWithIva,
            'Coste Base': totalCostBase,
            'IVA': iva,
            'Total Items': monthItems.length,
            'Cantidad Total': totalQuantity,
            'Nº Proveedores': uniqueProviders.size,
            'Nº Materiales': uniqueMaterials.size,
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Material': '',
            'Código Material': '',
            'Proveedor': '',
            'Cantidad Item': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });

        // Add items details
        monthItems.sort((a, b) => a.material.name.localeCompare(b.material.name, 'es', { sensitivity: 'base' }))
            .forEach((item, index) => {
                exportData.push({
                    'Orden de Trabajo': '',
                    'Año': '',
                    'Mes': '',
                    'Mes Nombre': '',
                    '--- RESUMEN ---': '',
                    'Coste Total (c/IVA)': '',
                    'Coste Base': '',
                    'IVA': '',
                    'Total Items': '',
                    'Cantidad Total': '',
                    'Nº Proveedores': '',
                    'Nº Materiales': '',
                    '--- DETALLE ITEMS ---': index === 0 ? '=== ITEMS ===' : '',
                    'Fecha Item': item.itemDate.toLocaleDateString('es-ES'),
                    'Material': item.material.name,
                    'Código Material': item.material.code,
                    'Proveedor': item.invoice.provider.name,
                    'Cantidad Item': item.quantity.toNumber(),
                    'Precio Unitario': item.unitPrice.toNumber(),
                    'Total Item (c/IVA)': item.totalPrice.toNumber() * 1.21,
                    'Nº Factura': item.invoice.invoiceCode
                });
            });

        // Add separator row
        exportData.push({
            'Orden de Trabajo': '',
            'Año': '',
            'Mes': '',
            'Mes Nombre': '',
            '--- RESUMEN ---': '',
            'Coste Total (c/IVA)': '',
            'Coste Base': '',
            'IVA': '',
            'Total Items': '',
            'Cantidad Total': '',
            'Nº Proveedores': '',
            'Nº Materiales': '',
            '--- DETALLE ITEMS ---': '',
            'Fecha Item': '',
            'Material': '',
            'Código Material': '',
            'Proveedor': '',
            'Cantidad Item': '',
            'Precio Unitario': '',
            'Total Item (c/IVA)': '',
            'Nº Factura': ''
        });
    }

    return exportData;
}

// Price alert interfaces and export function
export interface AlertExportFilters {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    materialId?: string;
    providerId?: string;
}

export interface AlertExport {
    'Fecha Detección': string;
    'Material': string;
    'Código Material': string;
    'Proveedor': string;
    'Precio Anterior': number;
    'Precio Nuevo': number;
    'Variación %': string;
    'Estado': string;
    'Fecha Efectiva': string;
    'Factura': string;
}

export async function generateAlertsExcelReport(filters: AlertExportFilters = {}) {
    // Build the where clause
    const where: Prisma.PriceAlertWhereInput = {};

    if (filters.status) {
        where.status = filters.status as 'PENDING' | 'APPROVED' | 'REJECTED';
    }

    if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
            where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
            where.createdAt.lte = filters.endDate;
        }
    }

    if (filters.materialId) {
        where.materialId = filters.materialId;
    }

    if (filters.providerId) {
        where.providerId = filters.providerId;
    }

    // Fetch ALL alerts with related data (no pagination limit)
    const alerts = await prisma.priceAlert.findMany({
        where,
        include: {
            material: true,
            provider: true,
            invoice: true,
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    // Transform data for Excel export
    const exportData: AlertExport[] = alerts.map(alert => ({
        'Fecha Detección': alert.createdAt.toLocaleDateString('es-ES'),
        'Material': alert.material.name,
        'Código Material': alert.material.code || '',
        'Proveedor': alert.provider.name,
        'Precio Anterior': Number(alert.oldPrice),
        'Precio Nuevo': Number(alert.newPrice),
        'Variación %': `${Number(alert.percentage) > 0 ? '+' : ''}${Number(alert.percentage).toFixed(2)}%`,
        'Estado': alert.status === 'PENDING'
            ? 'Pendiente'
            : alert.status === 'APPROVED'
                ? 'Aprobado'
                : 'Rechazado',
        'Fecha Efectiva': alert.effectiveDate.toLocaleDateString('es-ES'),
        'Factura': alert.invoice.invoiceCode
    }));

    // Create workbook
    const ws = createStyledWorksheet(exportData, [
        { wch: 15 }, // Fecha Detección
        { wch: 30 }, // Material
        { wch: 15 }, // Código Material
        { wch: 30 }, // Proveedor
        { wch: 12 }, // Precio Anterior
        { wch: 12 }, // Precio Nuevo
        { wch: 12 }, // Variación %
        { wch: 12 }, // Estado
        { wch: 15 }, // Fecha Efectiva
        { wch: 15 }, // Factura
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alertas de Precios');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
}