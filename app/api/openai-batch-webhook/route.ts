/*
  Webhook endpoint for OpenAI Batch API status updates. This route is called by OpenAI when the batch
  transitions between states (e.g., validating → in_progress → completed). We simply update our local
  BatchProcessing record so that the existing UI banner can reflect real-time progress.

  Note: A full implementation should verify the webhook signature that OpenAI sends using the
  OPENAI_BATCH_WEBHOOK_SECRET. To keep the first iteration concise we parse the payload directly and
  skip signature verification in development. Make sure to add that verification logic before
  deploying to production.
*/

import { NextRequest } from "next/server"
import { updateBatchProgress } from "@/lib/actions/invoices"
import { BatchStatus } from "@/generated/prisma"
import OpenAI from "openai"
import { createHmac, timingSafeEqual } from "crypto"

// Optional: Keep a client instance around for future use (e.g. retrieving batch details).
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
    const rawBody = await req.text()

    // -----------------------------------------------------------------
    // 1️⃣  Verify signature (if OPENAI_WEBHOOK_SECRET is set)
    // -----------------------------------------------------------------
    const secret = process.env.OPENAI_WEBHOOK_SECRET
    if (secret) {
        const signatureHeader = req.headers.get("webhook-signature") || ""
        const timestamp = req.headers.get("webhook-timestamp") || ""

        const [version, providedSig] = signatureHeader.split(",")
        if (version !== "v1" || !providedSig) {
            return new Response("Malformed signature header", { status: 400 })
        }

        const expectedSig = createHmac("sha256", secret)
            .update(`${timestamp}.${rawBody}`)
            .digest("base64")

        const sigValid = timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig))
        if (!sigValid) {
            return new Response("Invalid signature", { status: 400 })
        }
    }

    // -----------------------------------------------------------------
    // 2️⃣  Parse the event payload
    // -----------------------------------------------------------------
    interface RequestCounts {
        total?: number; completed?: number; failed?: number;
    }
    interface BatchEvent {
        type: string;
        data: { id: string; request_counts?: RequestCounts };
    }

    let event: BatchEvent
    try {
        event = JSON.parse(rawBody) as BatchEvent
    } catch {
        return new Response("Invalid JSON", { status: 400 })
    }

    if (!event.type?.startsWith("batch.")) {
        // Ignore events we don't care about (e.g. response.completed)
        return new Response("Ignored", { status: 200 })
    }

    const batchId: string | undefined = event.data?.id
    if (!batchId) {
        return new Response("Missing batch id", { status: 400 })
    }

    // Map OpenAI batch.* event types to our BatchStatus
    const type = event.type.split(".")[1] // e.g., "completed", "in_progress"
    const statusMap: Record<string, BatchStatus> = {
        validating: "PENDING",
        in_progress: "PROCESSING",
        finalizing: "PROCESSING",
        completed: "COMPLETED",
        failed: "FAILED",
        expired: "FAILED",
        cancelling: "PROCESSING",
        cancelled: "CANCELLED",
    }

    const mappedStatus = statusMap[type] ?? "PROCESSING"

    // Some events include progress counts under event.data.request_counts
    const counts: RequestCounts = event.data.request_counts ?? {}

    try {
        await updateBatchProgress(batchId, {
            status: mappedStatus,
            processedFiles: counts.completed ?? undefined,
            successfulFiles: counts.completed ?? undefined,
            failedFiles: counts.failed ?? undefined,
            completedAt: ["COMPLETED", "FAILED", "CANCELLED"].includes(mappedStatus) ? new Date() : undefined,
        })
    } catch (err) {
        console.error("Failed to update batch progress in DB", err)
        // Still acknowledge to prevent retries; reconciliation can happen later.
    }

    return new Response("OK")
} 