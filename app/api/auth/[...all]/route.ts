import { auth } from "@/auth"
import { toNextJsHandler } from "better-auth/next-js"
import type { NextRequest } from "next/server"

let handler: ReturnType<typeof toNextJsHandler>
try {
  handler = toNextJsHandler(auth)
} catch (error) {
  console.error("[auth] Failed to initialize auth handler:", error)
  throw error
}

async function withLogging(method: string, req: NextRequest) {
  console.log(`[auth] ${method} ${req.nextUrl.pathname}`)
  try {
    const response = await handler[method as keyof typeof handler](req)
    if (response.status >= 400) {
      console.error(`[auth] ${method} ${req.nextUrl.pathname} → ${response.status}`)
    }
    return response
  } catch (error) {
    console.error(`[auth] ${method} ${req.nextUrl.pathname} threw:`, error)
    throw error
  }
}

export const GET = (req: NextRequest) => withLogging("GET", req)
export const POST = (req: NextRequest) => withLogging("POST", req)
