import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import {
    getAuthBaseURLConfig,
    getTrustedOriginsList,
    shouldTrustProxyHeaders,
} from "@/lib/auth-domains";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: getAuthBaseURLConfig(),
    trustedOrigins: async () => getTrustedOriginsList(),
    advanced: {
        useSecureCookies: process.env.NODE_ENV === "production",
        ...(shouldTrustProxyHeaders() ? { trustedProxyHeaders: true } : {}),
    },
    plugins: [nextCookies()],
});