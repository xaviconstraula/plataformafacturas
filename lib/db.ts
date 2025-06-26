// lib/prisma.ts
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma || new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
        // Set transaction timeout to handle large batches
        transactionOptions: {
            timeout: 30000, // 30 seconds for large transactions
            maxWait: 10000, // 10 seconds max wait to acquire transaction
        },
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;