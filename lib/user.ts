import { cache } from "react"
import { prisma } from "./db"
import { redirect } from "next/navigation"
import { getCurrentUser, requireAdmin, signOut } from "./auth-utils"

export const getUser = cache(async () => {
    const user = await getCurrentUser()
    if (!user) return null

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            updatedAt: true,
        }
    })

    return dbUser
})

export async function checkIfAdmin() {
    return await requireAdmin()
}

export async function logout() {
    return await signOut()
}