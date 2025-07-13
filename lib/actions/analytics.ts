import { prisma } from "@/lib/db";
import { Prisma, ProviderType } from "@/generated/prisma";
import { normalizeSearch, processWorkOrderSearch } from "@/lib/utils";

export interface MaterialAnalytics {
    materialId: string;
    materialCode: string;
    referenceCode?: string;
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
    materialSearch?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: 'quantity' | 'cost' | 'lastPurchase' | 'name';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    page?: number;
    pageSize?: number;
}

export interface PaginatedMaterialAnalytics {
    materials: MaterialAnalytics[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
}

export async function getMaterialAnalytics(params: GetMaterialAnalyticsParams = {}): Promise<MaterialAnalytics[]> {
    // Normalize search parameters
    const normalizedCategory = normalizeSearch(params.category);
    const normalizedWorkOrder = processWorkOrderSearch(params.workOrder);
    const normalizedMaterialSearch = normalizeSearch(params.materialSearch);

    const where: Prisma.InvoiceItemWhereInput = {
        ...(params.materialId ? { materialId: params.materialId } : {}),
        ...(normalizedCategory ? { material: { category: { contains: normalizedCategory, mode: 'insensitive' } } } : {}),
        ...(normalizedWorkOrder ? { workOrder: { contains: normalizedWorkOrder, mode: 'insensitive' } } : {}),
        ...(params.supplierId ? { invoice: { providerId: params.supplierId } } : {}),
        ...(normalizedMaterialSearch ? {
            material: {
                OR: [
                    { name: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                    { code: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                    { referenceCode: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                ]
            }
        } : {}),
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
            referenceCode: material.referenceCode || undefined,
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

// New paginated version of getMaterialAnalytics for better performance with large datasets
export async function getMaterialAnalyticsPaginated(params: GetMaterialAnalyticsParams = {}): Promise<PaginatedMaterialAnalytics> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50; // Generous page size
    const skip = (page - 1) * pageSize;

    // Normalize search parameters
    const normalizedCategory = normalizeSearch(params.category);
    const normalizedWorkOrder = processWorkOrderSearch(params.workOrder);
    const normalizedMaterialSearch = normalizeSearch(params.materialSearch);

    // Build where clause for filtering
    const baseWhere: Prisma.InvoiceItemWhereInput = {
        ...(params.materialId ? { materialId: params.materialId } : {}),
        ...(normalizedCategory ? { material: { category: { contains: normalizedCategory, mode: 'insensitive' } } } : {}),
        ...(normalizedWorkOrder ? { workOrder: { contains: normalizedWorkOrder, mode: 'insensitive' } } : {}),
        ...(params.supplierId ? { invoice: { providerId: params.supplierId } } : {}),
        ...(normalizedMaterialSearch ? {
            material: {
                OR: [
                    { name: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                    { code: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                    { referenceCode: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                ]
            }
        } : {}),
        ...(params.startDate || params.endDate ? {
            itemDate: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {})
            }
        } : {})
    };

    // First, get unique materials with aggregated data using GROUP BY for better performance
    const materialAggregation = await prisma.invoiceItem.groupBy({
        by: ['materialId'],
        where: baseWhere,
        _sum: {
            quantity: true,
            totalPrice: true,
        },
        _count: {
            _all: true,
        },
        _max: {
            itemDate: true,
        },
        orderBy: params.sortBy === 'cost' ? { _sum: { totalPrice: params.sortOrder || 'desc' } }
            : params.sortBy === 'quantity' ? { _sum: { quantity: params.sortOrder || 'desc' } }
                : params.sortBy === 'lastPurchase' ? { _max: { itemDate: params.sortOrder || 'desc' } }
                    : { _sum: { totalPrice: params.sortOrder || 'desc' } }
    });

    // Get total count for pagination
    const totalCount = materialAggregation.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Apply pagination to the aggregated results
    const paginatedMaterialIds = materialAggregation
        .slice(skip, skip + pageSize)
        .map(item => item.materialId);

    if (paginatedMaterialIds.length === 0) {
        return {
            materials: [],
            totalCount,
            currentPage: page,
            pageSize,
            totalPages
        };
    }

    // Now get detailed data only for the materials in the current page
    const items = await prisma.invoiceItem.findMany({
        where: {
            ...baseWhere,
            materialId: { in: paginatedMaterialIds }
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
        },
        orderBy: {
            itemDate: 'desc'
        }
    });

    // Process the items to build MaterialAnalytics (same logic as before)
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
            referenceCode: material.referenceCode || undefined,
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
            lastPurchaseDate: materialItems[0].itemDate,
            workOrders,
            priceEvolution: priceEvolution.sort((a, b) => a.date.getTime() - b.date.getTime()),
            topSuppliers
        });
    }

    // Sort results according to requested order (maintain the same order as the aggregation)
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

    return {
        materials: analytics,
        totalCount,
        currentPage: page,
        pageSize,
        totalPages
    };
}

export interface MaterialFilterTotals {
    totalQuantity: number;
    totalCost: number;
    averageUnitPrice: number;
    materialCount: number;
    supplierCount: number;
}

// Function to get aggregated totals for all materials matching the filters
export async function getMaterialFilterTotals(params: GetMaterialAnalyticsParams = {}): Promise<MaterialFilterTotals> {
    // Normalize search parameters
    const normalizedCategory = normalizeSearch(params.category);
    const normalizedWorkOrder = processWorkOrderSearch(params.workOrder);
    const normalizedMaterialSearch = normalizeSearch(params.materialSearch);

    // Build where clause for filtering (same as in getMaterialAnalyticsPaginated)
    const baseWhere: Prisma.InvoiceItemWhereInput = {
        ...(params.materialId ? { materialId: params.materialId } : {}),
        ...(normalizedCategory ? { material: { category: { contains: normalizedCategory, mode: 'insensitive' } } } : {}),
        ...(normalizedWorkOrder ? { workOrder: { contains: normalizedWorkOrder, mode: 'insensitive' } } : {}),
        ...(params.supplierId ? { invoice: { providerId: params.supplierId } } : {}),
        ...(normalizedMaterialSearch ? {
            material: {
                OR: [
                    { name: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                    { code: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                    { referenceCode: { contains: normalizedMaterialSearch, mode: 'insensitive' } },
                ]
            }
        } : {}),
        ...(params.startDate || params.endDate ? {
            itemDate: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {})
            }
        } : {})
    };

    // Get aggregated data for ALL materials that match the filters
    const materialTotals = await prisma.invoiceItem.groupBy({
        by: ['materialId'],
        where: baseWhere,
        _sum: {
            quantity: true,
            totalPrice: true,
        }
    });

    // For supplier count, we need to get all unique suppliers that have sold 
    // any of the materials that match our filters
    const uniqueSupplierIds = await prisma.invoiceItem.findMany({
        where: baseWhere,
        select: {
            invoice: {
                select: {
                    providerId: true
                }
            }
        },
        distinct: ['invoiceId']  // Get distinct invoices first
    }).then(items => {
        const supplierIds = new Set(items.map(item => item.invoice.providerId));
        return supplierIds.size;
    });

    // Calculate totals
    const totalQuantity = materialTotals.reduce((sum, material) => sum + (material._sum.quantity?.toNumber() || 0), 0);
    const totalCost = materialTotals.reduce((sum, material) => sum + (material._sum.totalPrice?.toNumber() || 0), 0);
    const averageUnitPrice = totalCost / totalQuantity || 0;
    const materialCount = materialTotals.length;

    return {
        totalQuantity,
        totalCost,
        averageUnitPrice,
        materialCount,
        supplierCount: uniqueSupplierIds
    };
}

export interface GetSupplierAnalyticsParams {
    supplierId?: string;
    supplierType?: ProviderType;
    supplierCif?: string;
    workOrder?: string;
    materialCategory?: string;
    startDate?: Date;
    endDate?: Date;
    includeMonthlyBreakdown?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: 'spent' | 'invoices' | 'materials' | 'name';
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedSupplierAnalytics {
    suppliers: SupplierAnalytics[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
}

export async function getSupplierAnalytics(params: GetSupplierAnalyticsParams = {}): Promise<SupplierAnalytics[]> {
    // Normalize search parameters
    const normalizedSupplierCif = normalizeSearch(params.supplierCif);
    const normalizedWorkOrder = processWorkOrderSearch(params.workOrder);
    const normalizedMaterialCategory = normalizeSearch(params.materialCategory);

    const where: Prisma.InvoiceWhereInput = {
        ...(params.supplierId ? { providerId: params.supplierId } : {}),
        ...(params.supplierType ? { provider: { type: params.supplierType } } : {}),
        ...(normalizedSupplierCif ? { provider: { cif: { contains: normalizedSupplierCif, mode: 'insensitive' } } } : {}),
        ...(normalizedWorkOrder ? { items: { some: { workOrder: { contains: normalizedWorkOrder, mode: 'insensitive' } } } } : {}),
        ...(normalizedMaterialCategory ? { items: { some: { material: { category: { contains: normalizedMaterialCategory, mode: 'insensitive' } } } } } : {}),
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

    return analytics;
}

// New paginated version of getSupplierAnalytics for better performance with large datasets
export async function getSupplierAnalyticsPaginated(params: GetSupplierAnalyticsParams = {}): Promise<PaginatedSupplierAnalytics> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50; // Generous page size
    const skip = (page - 1) * pageSize;

    // Normalize search parameters
    const normalizedSupplierCif = normalizeSearch(params.supplierCif);
    const normalizedWorkOrder = processWorkOrderSearch(params.workOrder);
    const normalizedMaterialCategory = normalizeSearch(params.materialCategory);

    const baseWhere: Prisma.InvoiceWhereInput = {
        ...(params.supplierId ? { providerId: params.supplierId } : {}),
        ...(params.supplierType ? { provider: { type: params.supplierType } } : {}),
        ...(normalizedSupplierCif ? { provider: { cif: { contains: normalizedSupplierCif, mode: 'insensitive' } } } : {}),
        ...(normalizedWorkOrder ? { items: { some: { workOrder: { contains: normalizedWorkOrder, mode: 'insensitive' } } } } : {}),
        ...(normalizedMaterialCategory ? { items: { some: { material: { category: { contains: normalizedMaterialCategory, mode: 'insensitive' } } } } } : {}),
        ...(params.startDate || params.endDate ? {
            issueDate: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {})
            }
        } : {})
    };

    // First, get supplier aggregations for pagination and sorting
    const supplierAggregation = await prisma.invoice.groupBy({
        by: ['providerId'],
        where: baseWhere,
        _sum: {
            totalAmount: true,
        },
        _count: {
            _all: true,
        },
        _max: {
            issueDate: true,
        },
        orderBy: params.sortBy === 'spent' ? { _sum: { totalAmount: params.sortOrder || 'desc' } }
            : params.sortBy === 'invoices' ? { _count: { providerId: params.sortOrder || 'desc' } }
                : { _sum: { totalAmount: params.sortOrder || 'desc' } }
    });

    // Get total count for pagination
    const totalCount = supplierAggregation.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Apply pagination to the aggregated results
    const paginatedSupplierIds = supplierAggregation
        .slice(skip, skip + pageSize)
        .map(item => item.providerId);

    if (paginatedSupplierIds.length === 0) {
        return {
            suppliers: [],
            totalCount,
            currentPage: page,
            pageSize,
            totalPages
        };
    }

    // Now get detailed data only for the suppliers in the current page
    const invoices = await prisma.invoice.findMany({
        where: {
            ...baseWhere,
            providerId: { in: paginatedSupplierIds }
        },
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

    // Group by supplier and process (same logic as before)
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
            lastInvoiceDate: supplierInvoices[0].issueDate,
            monthlySpending,
            topMaterialsByQuantity,
            topMaterialsByCost,
            workOrders
        });
    }

    // Sort results according to requested order
    const sortBy = params.sortBy || 'spent';
    const sortOrder = params.sortOrder || 'desc';

    analytics.sort((a, b) => {
        let aValue: number, bValue: number;

        switch (sortBy) {
            case 'spent':
                aValue = a.totalSpent;
                bValue = b.totalSpent;
                break;
            case 'invoices':
                aValue = a.invoiceCount;
                bValue = b.invoiceCount;
                break;
            case 'materials':
                aValue = a.materialCount;
                bValue = b.materialCount;
                break;
            case 'name':
                return sortOrder === 'asc'
                    ? a.supplierName.localeCompare(b.supplierName)
                    : b.supplierName.localeCompare(a.supplierName);
            default:
                aValue = a.totalSpent;
                bValue = b.totalSpent;
        }

        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return {
        suppliers: analytics,
        totalCount,
        currentPage: page,
        pageSize,
        totalPages
    };
}

export async function getWorkOrderAnalytics(workOrder: string) {
    const items = await prisma.invoiceItem.findMany({
        where: {
            workOrder: { contains: processWorkOrderSearch(workOrder), mode: 'insensitive' }
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