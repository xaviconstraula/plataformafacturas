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
            cif: true,
            company: true,
            lastEmailCheck: true,

            role: true,
            billingSoftwareConfig: {
                select: {
                    software: true,
                    holdedApiKey: true,
                    a3SubscriptionKey: true,
                    a3UserMail: true,
                    a3UserPassword: true,
                    a3AccessToken: true,
                    a3RefreshToken: true,
                    a3TokenExpiresAt: true,
                    a3SelectedCompanyId: true,
                    a3CompanyAccessToken: true,
                    a3CompanyRefreshToken: true,
                    a3CompanyTokenExpiresAt: true,
                },
            },
        }
    })

    return user

})


export async function checkIfAdmin() {
    const user = await getUser()
    if (!user || user.role !== "ADMIN") {
        redirect("/dashboard")
    }
    return true;
}

export async function logout() {
    deleteSession()
    redirect("/login")
}