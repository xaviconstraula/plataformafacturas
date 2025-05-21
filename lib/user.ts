import { cache } from "react"
import { deleteSession, verifySession } from "./session"
import { prisma } from "./db"
import { redirect } from "next/navigation"

export const getUser = cache(async () => {
    const session = await verifySession()
    if (!session) return null

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            updatedAt: true,
        }
    })

    return user
})

export async function checkIfAdmin() {
    const email = process.env.ADMIN_EMAIL
    if (!email) throw new Error("ADMIN_EMAIL environment variable is not set")

    const user = await getUser()
    if (!user || user.email !== email) {
        redirect("/dashboard")
    }
    return true
}

export async function logout() {
    deleteSession()
    redirect("/login")
}