import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

type AuthenticatedUser = {
    id: string
    email: string
    name: string
    [key: string]: unknown
}

/**
 * Middleware to protect API routes with Better Auth
 * Returns the authenticated user if successful, or a 401 response
 */
export async function withAuth(request: NextRequest): Promise<AuthenticatedUser | NextResponse> {
    const session = await auth.api.getSession({
        headers: request.headers
    })

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return session.user as AuthenticatedUser
}

/**
 * Middleware to check if the authenticated user is an admin
 * Returns the authenticated admin user if successful, or a 403 response
 */
export async function withAdminAuth(request: NextRequest): Promise<AuthenticatedUser | NextResponse> {
    const user = await withAuth(request)

    // If withAuth returned a Response (401), return it
    if (user instanceof NextResponse) {
        return user
    }

    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
        return NextResponse.json({ error: 'Admin email not configured' }, { status: 500 })
    }

    if (user.email !== adminEmail) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return user
}

/**
 * Higher-order function to wrap API handlers with authentication
 */
export function withAuthHandler(
    handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
) {
    return async (request: NextRequest) => {
        const userOrResponse = await withAuth(request)

        if (userOrResponse instanceof NextResponse) {
            return userOrResponse
        }

        return handler(request, userOrResponse)
    }
}

/**
 * Higher-order function to wrap API handlers with admin authentication
 */
export function withAdminHandler(
    handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
) {
    return async (request: NextRequest) => {
        const userOrResponse = await withAdminAuth(request)

        if (userOrResponse instanceof NextResponse) {
            return userOrResponse
        }

        return handler(request, userOrResponse)
    }
}
