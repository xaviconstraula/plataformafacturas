// lib/prisma.ts
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma || new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
        // Set transaction timeout to handle massive batch processing (up to 10 hours)
        transactionOptions: {
            timeout: 36000000, // 10 hours for massive batch processing (36,000,000 ms)
            maxWait: 300000, // 5 minutes max wait to acquire transaction
        },
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;