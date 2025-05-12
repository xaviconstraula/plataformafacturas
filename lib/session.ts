"use server"

import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'


export type SessionPayload = {
    userId: string
    expiresAt: Date
}

const secretKey = process.env.AUTH_SECRET
if (!secretKey) {
    throw new Error('AUTH_SECRET must be set')
}
const encodedKey = new TextEncoder().encode(secretKey)



export async function encrypt(payload: SessionPayload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
    try {
        const { payload } = await jwtVerify(session, encodedKey, {
            algorithms: ['HS256'],
        })
        return payload
    } catch (error) {
        console.log('Failed to verify session')
    }
}

export async function createSession(userId: string) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const session = await encrypt({ userId, expiresAt })
    const cookieStore = await cookies()

    cookieStore.set('session', session, {
        httpOnly: true,
        secure: true,
        expires: expiresAt,
        sameSite: 'lax',
        path: '/',
    })
}


export async function verifySession(): Promise<{ userId: string }> {
    const cookiesStore = await cookies();
    const cookieSession = cookiesStore.get('session')?.value

    const session = await decrypt(cookieSession)
    if (!session?.userId) {
        redirect('/login')
    }

    return { userId: session.userId as string }
}

export async function deleteSession() {
    const cookieStore = await cookies()
    cookieStore.delete('session')
    redirect('/login')
}



export async function updateSession() {
    const session = (await cookies()).get('session')?.value
    const payload = await decrypt(session)

    if (!session || !payload) {
        return null
    }

    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
        httpOnly: true,
        secure: true,
        expires: expires,
        sameSite: 'lax',
        path: '/',
    })
}