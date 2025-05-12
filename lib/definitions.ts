import { z } from "zod"

// Validation Schemas
export const loginSchema = z.object({
    email: z.string().email("Correo electrónico inválido"),
    password: z.string().min(1, "La contraseña es requerida"),
})

export const signupSchema = z.object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    email: z.string().email("Correo electrónico inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
})

// Types
export type LoginFormData = z.infer<typeof loginSchema>
export type SignupFormData = z.infer<typeof signupSchema>

// Base type for form data
interface BaseFormData {
    email?: string
    name?: string
}

// Login specific form data
export interface LoginFormState extends BaseFormData {
    password?: string
}

// Signup specific form data
export interface SignupFormState extends BaseFormData {
    password?: string
    confirmPassword?: string
}

// Combined auth response type
export type AuthResponse = {
    errors?: {
        [key: string]: string[]
    }
    error?: string
    data?: LoginFormState | SignupFormState
}