const DEV_HOSTS = ["localhost:3000", "localhost:3001", "localhost:3002"] as const

function isLoopbackHost(host: string): boolean {
    const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase()
    return (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "::1" ||
        hostname.startsWith("127.")
    )
}

function hostFromUrl(url: string): string | null {
    try {
        return new URL(url).host
    } catch {
        return null
    }
}

/**
 * Hostnames allowed in production (comma-separated in ALLOWED_HOSTS).
 * Also includes the host from BETTER_AUTH_URL when set.
 */
export function getAllowedHosts(): string[] {
    const hosts = new Set<string>()

    if (process.env.ALLOWED_HOSTS) {
        for (const host of process.env.ALLOWED_HOSTS.split(",")) {
            const trimmed = host.trim()
            if (trimmed) hosts.add(trimmed)
        }
    }

    if (process.env.BETTER_AUTH_URL) {
        const host = hostFromUrl(process.env.BETTER_AUTH_URL)
        if (host) hosts.add(host)
    }

    if (process.env.NODE_ENV !== "production") {
        for (const host of DEV_HOSTS) {
            hosts.add(host)
        }
    }

    if (hosts.size === 0) {
        hosts.add("localhost:3000")
    }

    return [...hosts]
}

function hostToOrigins(host: string): string[] {
    if (isLoopbackHost(host)) {
        return [`http://${host}`]
    }
    return [`https://${host}`]
}

/** Origins passed to Better Auth trustedOrigins */
export function getTrustedOriginsList(): string[] {
    const origins = getAllowedHosts().flatMap(hostToOrigins)

    if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
        for (const origin of process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")) {
            const trimmed = origin.trim()
            if (trimmed) origins.push(trimmed)
        }
    }

    return [...new Set(origins)]
}

function getFallbackBaseUrl(allowedHosts: string[]): string {
    if (process.env.BETTER_AUTH_URL) {
        return process.env.BETTER_AUTH_URL
    }

    const primaryHost = allowedHosts.find((host) => !isLoopbackHost(host)) ?? allowedHosts[0]
    const protocol = isLoopbackHost(primaryHost) ? "http" : "https"
    return `${protocol}://${primaryHost}`
}

export type AuthBaseURLConfig =
    | string
    | {
          allowedHosts: string[]
          protocol: "http" | "https"
          fallback: string
      }

export function getAuthBaseURLConfig(): AuthBaseURLConfig {
    const allowedHosts = getAllowedHosts()

    if (allowedHosts.length > 1) {
        return {
            allowedHosts,
            protocol: process.env.NODE_ENV === "production" ? "https" : "http",
            fallback: getFallbackBaseUrl(allowedHosts),
        }
    }

    if (process.env.BETTER_AUTH_URL) {
        return process.env.BETTER_AUTH_URL
    }

    const host = allowedHosts[0]
    const protocol = isLoopbackHost(host) ? "http" : "https"
    return `${protocol}://${host}`
}

export function shouldTrustProxyHeaders(): boolean {
    return (
        process.env.NODE_ENV === "production" &&
        (process.env.AUTH_TRUST_PROXY_HEADERS === "true" ||
            getAllowedHosts().length > 1 ||
            Boolean(process.env.ALLOWED_HOSTS))
    )
}
