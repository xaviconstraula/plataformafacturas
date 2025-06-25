"use client"

import { useEffect } from "react"
import { toast } from "sonner"

interface BlockedProviderDetail {
    providerName: string;
    fileName: string;
}

export function InvoiceNotifications() {
    useEffect(() => {
        // Listen for blocked provider events from the file upload
        const handleBlockedProvider = (event: CustomEvent<BlockedProviderDetail>) => {
            const { providerName, fileName } = event.detail;
            toast.warning("Proveedor Bloqueado", {
                description: `El proveedor "${providerName}" está bloqueado y no puede ser procesado. Archivo: ${fileName}`,
                duration: 6000,
            });
        };

        // Add event listener
        window.addEventListener('blockedProvider', handleBlockedProvider as EventListener);

        // Cleanup
        return () => {
            window.removeEventListener('blockedProvider', handleBlockedProvider as EventListener);
        };
    }, []);

    return null; // This component doesn't render anything
} 