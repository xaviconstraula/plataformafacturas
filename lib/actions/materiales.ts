"use server"

import { prisma } from "@/lib/db"

export async function getMaterials() {
    try {
        const materials = await prisma.material.findMany({
            include: {
                _count: {
                    select: {
                        invoiceItems: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        return { materials }
    } catch (error) {
        console.error('Error fetching materials:', error)
        throw new Error('Failed to fetch materials')
    }
}



