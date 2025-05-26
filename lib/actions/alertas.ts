import { prisma } from "@/lib/db"
import type { Material, Provider } from "@/generated/prisma";

export interface PriceAlertWithDetails {
    id: string;
    material: Material;
    provider: Provider;
    oldPrice: number;  // previousPrice in the UI
    newPrice: number;  // currentPrice in the UI
    percentage: number;  // percentageChange in the UI
    effectiveDate: Date;  // issueDate in the UI
    createdAt: Date;
    updatedAt: Date;
    status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface PaginatedPriceAlerts {
    alerts: PriceAlertWithDetails[];
    total: number;
}

export async function getPriceAlerts(page: number = 1, take: number = 20): Promise<PaginatedPriceAlerts> {
    // Ensure page and take are valid numbers
    const validPage = Math.max(1, page)
    const validTake = Math.max(1, Math.min(50, take)) // Limit maximum items per page to 50
    const skip = (validPage - 1) * validTake

    const [alerts, total] = await Promise.all([
        prisma.priceAlert.findMany({
            include: {
                material: true,
                provider: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take: validTake,
        }),
        prisma.priceAlert.count(),
    ]);

    // Convert Decimal fields to numbers
    const serializedAlerts = alerts.map(alert => ({
        ...alert,
        oldPrice: Number(alert.oldPrice),
        newPrice: Number(alert.newPrice),
        percentage: Number(alert.percentage),
        material: alert.material,
        provider: alert.provider,
    }));

    return {
        alerts: serializedAlerts as unknown as PriceAlertWithDetails[],
        total,
    };
}



