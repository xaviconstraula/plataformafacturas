"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { signup } from "@/lib/actions/auth"
import type { SignupFormState, AuthResponse } from "@/lib/definitions"

const initialState = { errors: {}, data: {} as SignupFormState }

export default function SignupPage() {
    const [state, dispatch, isPending] = useActionState(signup, initialState)
    const formData = state?.data as SignupFormState | undefined

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
            <Card className="mx-auto w-sm">
                <CardHeader className="space-y-2 px-6 pt-6">
                    <div className="flex gap-1 items-center">
                        <Shield className="h-8 w-8 text-primary" />
                        <CardTitle className="text-2xl font-bold">Crear Cuenta</CardTitle>
                    </div>
                </CardHeader>
                <form action={dispatch}>
                    <CardContent className="space-y-6 px-6">
                        {state?.error && (
                            <p className="text-sm text-destructive text-center">{state.error}</p>
                        )}
                        <div className="space-y-3">
                            <Label htmlFor="name">Nombre</Label>
                            <Input
                                id="name"
                                name="name"
                                defaultValue={formData?.name}
                                className={state?.errors?.name ? "border-destructive" : ""}
                                aria-describedby={state?.errors?.name ? "name-error" : undefined}
                                disabled={isPending}
                            />
                            {state?.errors?.name && (
                                <p id="name-error" className="text-sm text-destructive">
                                    {state.errors.name[0]}
                                </p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="email">Correo electrónico</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                defaultValue={formData?.email}
                                className={state?.errors?.email ? "border-destructive" : ""}
                                aria-describedby={state?.errors?.email ? "email-error" : undefined}
                                disabled={isPending}
                            />
                            {state?.errors?.email && (
                                <p id="email-error" className="text-sm text-destructive">
                                    {state.errors.email[0]}
                                </p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                defaultValue={formData?.password}
                                className={state?.errors?.password ? "border-destructive" : ""}
                                aria-describedby={state?.errors?.password ? "password-error" : undefined}
                                disabled={isPending}
                            />
                            {state?.errors?.password && (
                                <p id="password-error" className="text-sm text-destructive">
                                    {state.errors.password[0]}
                                </p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                defaultValue={formData?.confirmPassword}
                                className={state?.errors?.confirmPassword ? "border-destructive" : ""}
                                aria-describedby={state?.errors?.confirmPassword ? "confirmPassword-error" : undefined}
                                disabled={isPending}
                            />
                            {state?.errors?.confirmPassword && (
                                <p id="confirmPassword-error" className="text-sm text-destructive">
                                    {state.errors.confirmPassword[0]}
                                </p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col px-6 py-6">
                        <Button type="submit" className="w-full" disabled={isPending}>
                            {isPending ? "Creando cuenta..." : "Crear Cuenta"}
                        </Button>
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