import { auth } from "@/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

/**
 * Get the current session from Better Auth
 * Returns null if no session exists
 */
export const getSession = cache(async () => {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    return session
})

/**
 * Get the current user from Better Auth
 * Returns null if no user is authenticated
 */
export const getCurrentUser = cache(async () => {
    const session = await getSession()
    return session?.user || null
})

/**
 * Require authentication - redirect to login if not authenticated
 * Returns the user if authenticated
 */
export async function requireAuth() {
    const user = await getCurrentUser()
    if (!user) {
        redirect("/login")
    }
    return user
}

/**
 * Check if the current user is an admin
 * Redirects to home if not admin
 */
export async function requireAdmin() {
    const email = process.env.ADMIN_EMAIL
    if (!email) throw new Error("ADMIN_EMAIL environment variable is not set")

    const user = await getCurrentUser()
    if (!user || user.email !== email) {
        redirect("/")
    }
    return user
}

/**
 * Sign out the current user using Better Auth
 */
export async function signOut() {
    await auth.api.signOut({
        headers: await headers()
    })
    redirect("/login")
}
