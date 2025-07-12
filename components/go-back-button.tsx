"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"

interface GoBackButtonProps {
    fallbackUrl: string
    label?: string
    variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive"
    size?: "default" | "sm" | "lg" | "icon"
    className?: string
    forceUrl?: boolean // When true, always use fallbackUrl instead of browser history
}

export function GoBackButton({
    fallbackUrl,
    label = "Volver",
    variant = "outline",
    size = "sm",
    className = "",
    forceUrl = false
}: GoBackButtonProps) {
    const router = useRouter()

    function handleGoBack() {
        if (forceUrl) {
            // Always use the fallback URL when forceUrl is true
            router.push(fallbackUrl)
        } else {
            // Check if we can go back in history
            if (typeof window !== 'undefined' && window.history.length > 1) {
                // Try to go back to preserve filters and state
                router.back()
            } else {
                // Fallback to the specified URL if no history
                router.push(fallbackUrl)
            }
        }
    }

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handleGoBack}
            className={`flex items-center gap-2 ${className}`}
        >
            <ArrowLeftIcon className="h-4 w-4" />
            {label}
        </Button>
    )
} 