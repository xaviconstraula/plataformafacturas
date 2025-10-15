"use client"

import { useEffect, useState } from "react"
import { BatchProgressBanner } from "./batch-progress-banner"

export function BatchProgressBannerWrapper() {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])

    // Only render on client side to avoid hydration issues
    if (!isClient) {
        return null
    }

    return <BatchProgressBanner />
}
