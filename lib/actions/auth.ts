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
        redirect("/dashboard")

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

    const data = validationResult.data

    try {
        const user = await prisma.user.findUnique({
            where: { email: data.email },
            select: { id: true, password: true },
        })

        if (!user) {
            return {
                error: "Credenciales inválidas",
                data: { email: data.email },
            }
        }

        const validPassword = await bcrypt.compare(data.password, user.password)

        if (!validPassword) {
            return {
                error: "Credenciales inválidas",
                data: { email: data.email },
            }
        }

        await createSession(user.id)
        redirect("/dashboard")

    } catch (error) {
        console.error("Error during login:", error)
        return {
            error: "Error al iniciar sesión",
            data: { email: data.email },
        }
    }
}