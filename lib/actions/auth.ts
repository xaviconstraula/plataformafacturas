'use server'

import { auth } from '@/auth'
import { APIError } from 'better-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export interface SignInResult {
    error?: string
}

export async function signInWithEmailAction(
    email: string,
    password: string,
): Promise<SignInResult> {
    try {
        await auth.api.signInEmail({
            body: {
                email,
                password,
            },
            headers: await headers(),
        })
    } catch (error) {
        if (error instanceof APIError) {
            return { error: error.message || 'Credenciales inválidas' }
        }

        console.error('[signInWithEmailAction] Unexpected error:', error)
        return { error: 'Error inesperado al iniciar sesión' }
    }

    redirect('/')
}
