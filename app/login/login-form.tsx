"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { signInWithEmailAction } from "@/lib/actions/auth"
import { loginSchema } from "@/lib/definitions"

interface LoginFormState {
  email: string
  password: string
}

interface LoginErrors {
  email?: string[]
  password?: string[]
}

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <Button type="submit" className="w-full" aria-disabled={isPending} disabled={isPending}>
      {isPending ? "Iniciando sesión..." : "Iniciar sesión"}
    </Button>
  )
}

export function LoginForm() {
  const [isPending, setIsPending] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [generalError, setGeneralError] = useState<string>("")
  const [formData, setFormData] = useState<LoginFormState>({
    email: "",
    password: "",
  })

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsPending(true)
    setErrors({})
    setGeneralError("")

    const form = event.currentTarget
    const formDataObj = new FormData(form)
    const email = formDataObj.get("email") as string
    const password = formDataObj.get("password") as string

    const validationResult = loginSchema.safeParse({ email, password })

    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors
      setErrors(fieldErrors)
      setIsPending(false)
      return
    }

    try {
      const result = await signInWithEmailAction(email, password)

      if (result.error) {
        setGeneralError(result.error)
        setIsPending(false)
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "digest" in error &&
        typeof error.digest === "string" &&
        error.digest.startsWith("NEXT_REDIRECT")
      ) {
        throw error
      }

      console.error("Login error:", error)
      setGeneralError("Error inesperado al iniciar sesión")
      setIsPending(false)
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name as keyof LoginErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="mx-auto w-sm">
        <CardHeader className="space-y-2 px-6 pt-6">
          <div className="flex gap-1 items-center">
            <Shield className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Iniciar Sesión</CardTitle>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6 px-6">
            {generalError ? (
              <p className="text-sm text-destructive text-center">{generalError}</p>
            ) : null}
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
              {errors?.email ? (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email[0]}
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
              </div>
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
              {errors?.password ? (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password[0]}
                </p>
              ) : null}
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
