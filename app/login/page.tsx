"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { login } from "@/lib/actions/auth"
import type { LoginFormState } from "@/lib/definitions"

const initialState = { errors: {}, data: {} as LoginFormState }

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <Button type="submit" className="w-full" aria-disabled={isPending} disabled={isPending}>
      {isPending ? "Iniciando sesión..." : "Iniciar sesión"}
    </Button>
  )
}

export default function LoginPage() {
  const [state, dispatch, isPending] = useActionState(login, initialState)
  const formData = state?.data as LoginFormState | undefined

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="mx-auto w-sm">
        <CardHeader className="space-y-2 px-6 pt-6">
          <div className="flex gap-1 items-center">
            <Shield className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Iniciar Sesión</CardTitle>
          </div>
        </CardHeader>
        <form action={dispatch}>
          <CardContent className="space-y-6 px-6">
            {state?.error && (
              <p className="text-sm text-destructive text-center">{state.error}</p>
            )}
            <div className="space-y-3">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={formData?.email}
                className={state?.errors?.email ? "border-destructive" : ""}
                aria-describedby={state?.errors?.email ? "email-error" : undefined}
                required
              />
              {state?.errors?.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {state.errors.email[0]}
                </p>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>

              </div>
              <Input
                id="password"
                name="password"
                type="password"
                defaultValue={formData?.password}
                className={state?.errors?.password ? "border-destructive" : ""}
                aria-describedby={state?.errors?.password ? "password-error" : undefined}
                required
              />
              {state?.errors?.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {state.errors.password[0]}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col px-6 pb-6">
            <SubmitButton isPending={isPending} />

          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

