import { prisma } from "@/lib/db";
import { Prisma, ProviderType } from "@/generated/prisma";

export interface MaterialAnalytics {
    materialId: string;
    materialCode: string;
    materialName: string;
    category?: string;
    unit?: string;
    isActive: boolean;
    productGroup?: {
        id: string;
        standardizedName: string;
    };
    totalQuantity: number;
    totalCost: number;
    averageUnitPrice: number;
    invoiceCount: number;
    supplierCount: number;
    lastPurchaseDate: Date;
    workOrders: string[];
    priceEvolution: {
        date: Date;
        price: number;
        supplierId: string;
        supplierName: string;
    }[];
    topSuppliers: {
        supplierId: string;
        supplierName: string;
        totalQuantity: number;
        totalCost: number;
        invoiceCount: number;
    }[];
}

export interface SupplierAnalytics {
    supplierId: string;
    supplierName: string;
    supplierCif: string;
    supplierType: ProviderType;
    email: string | null;
    phone: string | null;
    address: string | null;
    totalSpent: number;
    invoiceCount: number;
    materialCount: number;
    workOrderCount: number;
    averageInvoiceAmount: number;
    lastInvoiceDate: Date;
    monthlySpending: {
        month: string;
        totalSpent: number;
        invoiceCount: number;
    }[];
    topMaterialsByQuantity: {
        materialId: string;
        materialName: string;
        totalQuantity: number;
        totalCost: number;
        averagePrice: number;
    }[];
    topMaterialsByCost: {
        materialId: string;
        materialName: string;
        totalQuantity: number;
        totalCost: number;
        averagePrice: number;
    }[];
    workOrders: string[];
}

export interface GetMaterialAnalyticsParams {
    materialId?: string;
    category?: string;
    workOrder?: string;
    supplierId?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: 'quantity' | 'cost' | 'lastPurchase' | 'name';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
}

export async function getMaterialAnalytics(params: GetMaterialAnalyticsParams = {}): Promise<MaterialAnalytics[]> {
    const where: Prisma.InvoiceItemWhereInput = {
        ...(params.materialId ? { materialId: params.materialId } : {}),
        ...(params.category ? { material: { category: { contains: params.category, mode: 'insensitive' } } } : {}),
        ...(params.workOrder ? { workOrder: { contains: params.workOrder, mode: 'insensitive' } } : {}),
        ...(params.supplierId ? { invoice: { providerId: params.supplierId } } : {}),
        ...(params.startDate || params.endDate ? {
            itemDate: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {})
            }
        } : {})
    };

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
        orderBy: {
            itemDate: 'desc'
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

    const analytics: MaterialAnalytics[] = [];

    for (const [materialId, materialItems] of materialGroups) {
        const firstItem = materialItems[0];
        const material = firstItem.material;

        const totalQuantity = materialItems.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
        const totalCost = materialItems.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
        const averageUnitPrice = totalCost / totalQuantity;

        const workOrders = [...new Set(materialItems.map(item => item.workOrder).filter(Boolean))] as string[];

        const supplierMap = new Map<string, {
            supplierId: string;
            supplierName: string;
            totalQuantity: number;
            totalCost: number;
            invoiceCount: number;
        }>();

        const priceEvolution: MaterialAnalytics['priceEvolution'] = [];

        for (const item of materialItems) {
            const supplierId = item.invoice.providerId;
            const supplierName = item.invoice.provider.name;

            // Build supplier statistics
            if (!supplierMap.has(supplierId)) {
                supplierMap.set(supplierId, {
                    supplierId,
                    supplierName,
                    totalQuantity: 0,
                    totalCost: 0,
                    invoiceCount: 0
                });
            }

            const supplierStats = supplierMap.get(supplierId)!;
            supplierStats.totalQuantity += item.quantity.toNumber();
            supplierStats.totalCost += item.totalPrice.toNumber();
            supplierStats.invoiceCount += 1;

            // Build price evolution
            priceEvolution.push({
                date: item.itemDate,
                price: item.unitPrice.toNumber(),
                supplierId,
                supplierName
            });
        }

        const topSuppliers = Array.from(supplierMap.values())
            .sort((a, b) => b.totalCost - a.totalCost);

        analytics.push({
            materialId,
            materialCode: material.code,
            materialName: material.name,
            category: material.category || undefined,
            unit: material.unit || undefined,
            isActive: material.isActive,
            productGroup: material.productGroup ? {
                id: material.productGroup.id,
                standardizedName: material.productGroup.standardizedName
            } : undefined,
            totalQuantity,
            totalCost,
            averageUnitPrice,
            invoiceCount: materialItems.length,
            supplierCount: supplierMap.size,
            lastPurchaseDate: materialItems[0].itemDate, // Items are ordered by date desc
            workOrders,
            priceEvolution: priceEvolution.sort((a, b) => a.date.getTime() - b.date.getTime()),
            topSuppliers
        });
    }

    // Sort results
    const sortBy = params.sortBy || 'cost';
    const sortOrder = params.sortOrder || 'desc';

    analytics.sort((a, b) => {
        let aValue: number, bValue: number;

        switch (sortBy) {
            case 'quantity':
                aValue = a.totalQuantity;
                bValue = b.totalQuantity;
                break;
            case 'cost':
                aValue = a.totalCost;
                bValue = b.totalCost;
                break;
            case 'lastPurchase':
                aValue = a.lastPurchaseDate.getTime();
                bValue = b.lastPurchaseDate.getTime();
                break;
            case 'name':
                return sortOrder === 'asc'
                    ? a.materialName.localeCompare(b.materialName)
                    : b.materialName.localeCompare(a.materialName);
            default:
                aValue = a.totalCost;
                bValue = b.totalCost;
        }

        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return params.limit ? analytics.slice(0, params.limit) : analytics;
}

export interface GetSupplierAnalyticsParams {
    supplierId?: string;
    supplierType?: string;
    workOrder?: string;
    materialCategory?: string;
    startDate?: Date;
    endDate?: Date;
    includeMonthlyBreakdown?: boolean;
}

export async function getSupplierAnalytics(params: GetSupplierAnalyticsParams = {}): Promise<SupplierAnalytics[]> {
    const where: Prisma.InvoiceWhereInput = {
        ...(params.supplierId ? { providerId: params.supplierId } : {}),
        ...(params.supplierType ? { provider: { type: params.supplierType as 'MATERIAL_SUPPLIER' | 'MACHINERY_RENTAL' } } : {}),
        ...(params.workOrder ? { items: { some: { workOrder: { contains: params.workOrder, mode: 'insensitive' } } } } : {}),
        ...(params.materialCategory ? { items: { some: { material: { category: { contains: params.materialCategory, mode: 'insensitive' } } } } } : {}),
        ...(params.startDate || params.endDate ? {
            issueDate: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {})
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
        },
        orderBy: {
            issueDate: 'desc'
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

    const analytics: SupplierAnalytics[] = [];

    for (const [supplierId, supplierInvoices] of supplierGroups) {
        const supplier = supplierInvoices[0].provider;

        const totalSpent = supplierInvoices.reduce((sum, invoice) => sum + invoice.totalAmount.toNumber(), 0);
        const invoiceCount = supplierInvoices.length;
        const averageInvoiceAmount = totalSpent / invoiceCount;

        // Get all items for this supplier
        const allItems = supplierInvoices.flatMap(invoice => invoice.items);

        const materialMap = new Map<string, {
            materialId: string;
            materialName: string;
            totalQuantity: number;
            totalCost: number;
            priceSum: number;
            itemCount: number;
        }>();

        const workOrders = [...new Set(allItems.map(item => item.workOrder).filter(Boolean))] as string[];

        for (const item of allItems) {
            const materialId = item.materialId;
            const materialName = item.material.name;

            if (!materialMap.has(materialId)) {
                materialMap.set(materialId, {
                    materialId,
                    materialName,
                    totalQuantity: 0,
                    totalCost: 0,
                    priceSum: 0,
                    itemCount: 0
                });
            }

            const materialStats = materialMap.get(materialId)!;
            materialStats.totalQuantity += item.quantity.toNumber();
            materialStats.totalCost += item.totalPrice.toNumber();
            materialStats.priceSum += item.unitPrice.toNumber();
            materialStats.itemCount += 1;
        }

        const materialStats = Array.from(materialMap.values()).map(stats => ({
            materialId: stats.materialId,
            materialName: stats.materialName,
            totalQuantity: stats.totalQuantity,
            totalCost: stats.totalCost,
            averagePrice: stats.priceSum / stats.itemCount
        }));

        const topMaterialsByQuantity = [...materialStats]
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
            .slice(0, 10);

        const topMaterialsByCost = [...materialStats]
            .sort((a, b) => b.totalCost - a.totalCost)
            .slice(0, 10);

        // Monthly breakdown
        const monthlySpending: SupplierAnalytics['monthlySpending'] = [];

        if (params.includeMonthlyBreakdown) {
            const monthlyMap = new Map<string, { totalSpent: number; invoiceCount: number }>();

            for (const invoice of supplierInvoices) {
                const monthKey = invoice.issueDate.toISOString().substring(0, 7); // YYYY-MM

                if (!monthlyMap.has(monthKey)) {
                    monthlyMap.set(monthKey, { totalSpent: 0, invoiceCount: 0 });
                }

                const monthStats = monthlyMap.get(monthKey)!;
                monthStats.totalSpent += invoice.totalAmount.toNumber();
                monthStats.invoiceCount += 1;
            }

            for (const [month, stats] of monthlyMap) {
                monthlySpending.push({
                    month,
                    totalSpent: stats.totalSpent,
                    invoiceCount: stats.invoiceCount
                });
            }

            monthlySpending.sort((a, b) => a.month.localeCompare(b.month));
        }

        analytics.push({
            supplierId,
            supplierName: supplier.name,
            supplierCif: supplier.cif,
            supplierType: supplier.type,
            email: supplier.email,
            phone: supplier.phone,
            address: supplier.address,
            totalSpent,
            invoiceCount,
            materialCount: materialMap.size,
            workOrderCount: workOrders.length,
            averageInvoiceAmount,
            lastInvoiceDate: supplierInvoices[0].issueDate, // Invoices are ordered by date desc
            monthlySpending,
            topMaterialsByQuantity,
            topMaterialsByCost,
            workOrders
        });
    }

    return analytics.sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getWorkOrderAnalytics(workOrder: string) {
    const items = await prisma.invoiceItem.findMany({
        where: {
            workOrder: { contains: workOrder, mode: 'insensitive' }
        },
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

    const totalCost = items.reduce((sum, item) => sum + item.totalPrice.toNumber(), 0);
    const invoiceCount = [...new Set(items.map(item => item.invoiceId))].length;
    const supplierCount = [...new Set(items.map(item => item.invoice.providerId))].length;
    const materialCount = [...new Set(items.map(item => item.materialId))].length;

    return {
        workOrder,
        totalCost,
        invoiceCount,
        supplierCount,
        materialCount,
        items: items.map(item => ({
            materialName: item.material.name,
            quantity: item.quantity.toNumber(),
            unitPrice: item.unitPrice.toNumber(),
            totalPrice: item.totalPrice.toNumber(),
            supplierName: item.invoice.provider.name,
            invoiceCode: item.invoice.invoiceCode,
            itemDate: item.itemDate
        }))
    };
}

export async function exportInvoiceData(params: GetMaterialAnalyticsParams & GetSupplierAnalyticsParams) {
    // This function will be used to generate Excel exports
    const [materialAnalytics, supplierAnalytics] = await Promise.all([
        getMaterialAnalytics(params),
        getSupplierAnalytics(params)
    ]);

    return {
        materials: materialAnalytics,
        suppliers: supplierAnalytics,
        exportDate: new Date(),
        filters: params
    };
} 