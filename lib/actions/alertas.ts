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

export async function getPriceAlerts(
    page: number = 1,
    take: number = 20,
    status: string = "PENDING"
): Promise<PaginatedPriceAlerts> {
    // Ensure page and take are valid numbers
    const validPage = Math.max(1, page)
    const validTake = Math.max(1, Math.min(50, take)) // Limit maximum items per page to 50
    const skip = (validPage - 1) * validTake

    // Build where clause based on status
    const where = status === "ALL" ? {} : { status }

    // For ALL status, we want PENDING first, then others
    // For specific status, just sort by date
    const orderBy = status === "ALL"
        ? [
            { status: "asc" as const }, // PENDING comes before others alphabetically
            { createdAt: "desc" as const }
        ]
        : [{ createdAt: "desc" as const }]

    const [alerts, total] = await Promise.all([
        prisma.priceAlert.findMany({
            where,
            include: {
                material: true,
                provider: true,
            },
            orderBy,
            skip,
            take: validTake,
        }),
        prisma.priceAlert.count({ where }),
    ]);

    // Convert Decimal fields to numbers and include relations
    const serializedAlerts = alerts.map(alert => ({
        ...alert,
        oldPrice: Number(alert.oldPrice),
        newPrice: Number(alert.newPrice),
        percentage: Number(alert.percentage),
        material: alert.material,
        provider: alert.provider,
    })) as unknown as PriceAlertWithDetails[];

    return {
        alerts: serializedAlerts,
        total,
    };
}



