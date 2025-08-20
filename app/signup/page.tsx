"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { authClient } from "@/lib/auth-client"

interface SignupFormState {
    email: string
    password: string
    secretCode: string
}

interface SignupErrors {
    email?: string[]
    password?: string[]
    secretCode?: string[]
}

function SubmitButton({ isPending }: { isPending: boolean }) {
    return (
        <Button type="submit" className="w-full" aria-disabled={isPending} disabled={isPending}>
            {isPending ? "Creando cuenta..." : "Crear Cuenta"}
        </Button>
    )
}

export default function SignupPage() {
    const [isPending, setIsPending] = useState(false)
    const [errors, setErrors] = useState<SignupErrors>({})
    const [generalError, setGeneralError] = useState<string>("")
    const [formData, setFormData] = useState<SignupFormState>({
        email: "",
        password: "",
        secretCode: ""
    })
    const router = useRouter()

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsPending(true)
        setErrors({})
        setGeneralError("")

        const form = event.currentTarget
        const formDataObj = new FormData(form)
        const email = formDataObj.get("email") as string
        const password = formDataObj.get("password") as string
        const secretCode = formDataObj.get("secretCode") as string

        // Validate secret code
        if (secretCode !== "hacelerix") {
            setErrors({ secretCode: ["Código secreto inválido"] })
            setIsPending(false)
            return
        }

        // Basic validation
        if (!email || !password) {
            const newErrors: SignupErrors = {}
            if (!email) newErrors.email = ["El correo electrónico es requerido"]
            if (!password) newErrors.password = ["La contraseña es requerida"]
            setErrors(newErrors)
            setIsPending(false)
            return
        }

        try {
            const { data, error } = await authClient.signUp.email({
                email,
                password,
                name: email.split('@')[0], // Use part of email as name since we don't collect it
                image: undefined, // Explicitly set optional field
                callbackURL: "/"
            }, {
                onRequest: (ctx) => {
                    // Loading state is already handled by isPending
                },
                onSuccess: (ctx) => {
                    // Redirect to dashboard or login
                    router.push("/")
                },
                onError: (ctx) => {
                    setGeneralError(ctx.error.message || "Error al crear la cuenta")
                }
            })

            if (error) {
                setGeneralError(error.message || "Error al crear la cuenta")
            } else if (data) {
                // Successful signup, redirect will be handled by callbackURL
                router.push("/dashboard")
            }
        } catch (error) {
            console.error("Signup error:", error)
            setGeneralError("Error inesperado al crear la cuenta")
        } finally {
            setIsPending(false)
        }
    }

    function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
        // Clear errors when user starts typing
        if (errors[name as keyof SignupErrors]) {
            setErrors(prev => ({
                ...prev,
                [name]: undefined
            }))
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
            <Card className="mx-auto w-sm">
                <CardHeader className="space-y-2 px-6 pt-6">
                    <div className="flex gap-1 items-center">
                        <Shield className="h-8 w-8 text-primary" />
                        <CardTitle className="text-2xl font-bold">Crear Cuenta</CardTitle>
                    </div>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-6 px-6">
                        {generalError && (
                            <p className="text-sm text-destructive text-center">{generalError}</p>
                        )}
                        <div className="space-y-3">
                            <Label htmlFor="email">Correo electrónico</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className={errors?.email ? "border-destructive" : ""}
                                aria-describedby={errors?.email ? "email-error" : undefined}
                                required
                            />
                            {errors?.email && (
                                <p id="email-error" className="text-sm text-destructive">
                                    {errors.email[0]}
                                </p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                className={errors?.password ? "border-destructive" : ""}
                                aria-describedby={errors?.password ? "password-error" : undefined}
                                required
                            />
                            {errors?.password && (
                                <p id="password-error" className="text-sm text-destructive">
                                    {errors.password[0]}
                                </p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="secretCode">Código Secreto</Label>
                            <Input
                                id="secretCode"
                                name="secretCode"
                                type="text"
                                value={formData.secretCode}
                                onChange={handleInputChange}
                                className={errors?.secretCode ? "border-destructive" : ""}
                                aria-describedby={errors?.secretCode ? "secretCode-error" : undefined}
                                placeholder="Ingrese el código secreto"
                                required
                            />
                            {errors?.secretCode && (
                                <p id="secretCode-error" className="text-sm text-destructive">
                                    {errors.secretCode[0]}
                                </p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col px-6 pb-6">
                        <SubmitButton isPending={isPending} />
                        <div className="mt-6 text-center text-sm">
                            ¿Ya tienes una cuenta?{" "}
                            <Link href="/login" className="text-primary hover:underline">
                                Iniciar Sesión
                            </Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}