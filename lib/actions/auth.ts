"use server"

import { prisma } from "@/lib/db"
import { signupSchema, loginSchema, type AuthResponse } from "@/lib/definitions"
import bcrypt from "bcryptjs"
import { createSession } from "../session"
import { redirect } from "next/navigation"

export async function signup(
    prevState: AuthResponse | null,
    formData: FormData
): Promise<AuthResponse> {
    const validationResult = signupSchema.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
    })

    if (!validationResult.success) {
        return {
            errors: validationResult.error.flatten().fieldErrors,
            data: {
                email: formData.get("email")?.toString(),
                name: formData.get("name")?.toString(),
            },
        }
    }

    const data = validationResult.data

    try {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
            select: { id: true },
        })

        if (existingUser) {
            return {
                error: "El usuario ya existe",
                data: {
                    email: data.email,
                    name: data.name,
                },
            }
        }

        const hashedPassword = await bcrypt.hash(data.password, 10)

        const user = await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
            },
            select: { id: true },
        })

        await createSession(user.id)
        redirect("/")

    } catch (error) {
        console.error("Error during signup:", error)
        return {
            error: "Error al crear el usuario",
            data: {
                email: data.email,
                name: data.name,
            },
        }
    }
}

export async function login(
    prevState: AuthResponse | null,
    formData: FormData
): Promise<AuthResponse> {
    const validationResult = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    })

    if (!validationResult.success) {
        return {
            errors: validationResult.error.flatten().fieldErrors,
            data: {
                email: formData.get("email")?.toString(),
            },
        }
    }

    const data = validationResult.data;
    const envEmail = process.env.LOGIN_EMAIL;
    const envPassword = process.env.LOGIN_PASSWORD;

    if (!envEmail || !envPassword) {
        console.error("EMAIL or PASSWORD environment variables are not set.")
        return {
            error: "Error de configuración del servidor. Por favor, contacta al administrador.",
            data: { email: data.email },
        }
    }

    try {
        const emailMatch = data.email === envEmail
        const passwordMatch = data.password === envPassword

        if (!emailMatch || !passwordMatch) {
            return {
                error: "Credenciales inválidas",
                data: { email: data.email },
            }
        }

        // Using email as a user identifier for the session, as there's no DB user ID
        await createSession(data.email)
        redirect("/")

    } catch (error) {
        if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
            throw error;
        }
        console.error("Error during login:", error)
        return {
            error: "Error al iniciar sesión",
            data: { email: data.email },
        }
    }
}