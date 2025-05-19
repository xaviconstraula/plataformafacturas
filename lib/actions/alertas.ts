"use server"

import { prisma } from "@/lib/db"
import type { PriceAlert, Material, Provider } from "@/generated/prisma";

export interface PriceAlertWithDetails extends PriceAlert {
    material: Material;
    provider: Provider;
}

export async function getPriceAlerts(): Promise<PriceAlertWithDetails[]> {
    const alerts = await prisma.priceAlert.findMany({
        include: {
            material: true,
            provider: true,
        },
        orderBy: {
            createdAt: 'desc', // Show newest alerts first
        },
    });
    return alerts;
}



