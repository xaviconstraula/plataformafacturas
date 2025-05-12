"use server"

import { prisma } from "@/lib/db"

export async function getSuppliers() {
    try {
        const suppliers = await prisma.provider.findMany({
            include: {
                _count: {
                    select: {
                        invoices: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        return { suppliers }
    } catch (error) {
        console.error('Error fetching suppliers:', error)
        throw new Error('Failed to fetch suppliers')
    }
}



