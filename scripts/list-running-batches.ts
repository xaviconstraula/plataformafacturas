#!/usr/bin/env tsx

/**
 * List all properties of running batches from both:
 * 1. Database (BatchProcessing with status PENDING/PROCESSING)
 * 2. Gemini API (batch jobs from Google)
 *
 * Requires GEMINI_API_KEY in the environment for the Gemini section
 * (e.g. export from .env or: env $(grep -v '^#' .env | xargs) npx tsx scripts/list-running-batches.ts)
 *
 * Usage:
 *   npx tsx scripts/list-running-batches.ts
 */

import { prisma } from "@/lib/db"
import { GoogleGenAI } from "@google/genai"

function formatDate(d: Date | null): string {
  if (!d) return "—"
  return d.toISOString()
}

function formatJson(value: unknown): string {
  if (value == null) return "—"
  try {
    const str = JSON.stringify(value, null, 2)
    return str.length > 500 ? str.slice(0, 500) + "\n  ... (truncated)" : str
  } catch {
    return String(value)
  }
}

function formatStr(s: string | null | undefined): string {
  return s ?? "—"
}

async function listDbBatches() {
  console.log("═══ BATCHES IN DATABASE (PENDING / PROCESSING) ═══\n")

  const batches = await prisma.batchProcessing.findMany({
    where: {
      status: {
        in: ["PENDING", "PROCESSING"],
      },
    },
    orderBy: { createdAt: "desc" },
  })

  if (batches.length === 0) {
    console.log("No running batches found in the database.\n")
    return
  }

  console.log(`Found ${batches.length} running batch(es):\n`)
  console.log("—".repeat(60))

  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]
    console.log(`\n[${i + 1}] Batch ID: ${b.id}`)
    console.log(`    status:               ${b.status}`)
    console.log(`    totalFiles:           ${b.totalFiles}`)
    console.log(`    processedFiles:      ${b.processedFiles}`)
    console.log(`    successfulFiles:     ${b.successfulFiles}`)
    console.log(`    failedFiles:         ${b.failedFiles}`)
    console.log(`    blockedFiles:        ${b.blockedFiles}`)
    console.log(`    currentFile:         ${b.currentFile ?? "—"}`)
    console.log(`    estimatedCompletion: ${formatDate(b.estimatedCompletion)}`)
    console.log(`    startedAt:           ${formatDate(b.startedAt)}`)
    console.log(`    completedAt:         ${formatDate(b.completedAt)}`)
    console.log(`    createdAt:           ${formatDate(b.createdAt)}`)
    console.log(`    updatedAt:           ${formatDate(b.updatedAt)}`)
    console.log(`    userId:              ${b.userId ?? "—"}`)
    console.log(`    retryAttempts:       ${b.retryAttempts}`)
    console.log(`    retriedFiles:        ${b.retriedFiles}`)
    if (b.errors != null) {
      console.log(`    errors:`)
      console.log(formatJson(b.errors).split("\n").map((l) => `      ${l}`).join("\n"))
    } else {
      console.log(`    errors:              —`)
    }
    if (b.r2Keys != null) {
      console.log(`    r2Keys:              ${typeof b.r2Keys === "object" ? JSON.stringify(b.r2Keys).slice(0, 80) + "…" : formatJson(b.r2Keys)}`)
    } else {
      console.log(`    r2Keys:              —`)
    }
    console.log("—".repeat(60))
  }

  console.log("")
}

async function listGeminiBatches() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log("═══ BATCHES IN GEMINI API ═══\n")
    console.log("Skipped: GEMINI_API_KEY not set. Set it to list batches from Gemini.\n")
    return
  }

  console.log("═══ BATCHES IN GEMINI API ═══\n")

  try {
    const gemini = new GoogleGenAI({ apiKey })
    const pager = await gemini.batches.list({ config: { pageSize: 50 } })

    const jobs: Array<Record<string, unknown>> = []
    for await (const job of pager) {
      jobs.push(job as Record<string, unknown>)
    }

    if (jobs.length === 0) {
      console.log("No batch jobs returned by Gemini API.\n")
      return
    }

    console.log(`Found ${jobs.length} batch job(s) from Gemini:\n`)
    console.log("—".repeat(60))

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i]
      const name = j.name as string | undefined
      const state = j.state as string | undefined
      const createTime = j.createTime as string | undefined
      const updateTime = j.updateTime as string | undefined
      const startTime = j.startTime as string | undefined
      const endTime = j.endTime as string | undefined
      const model = j.model as string | undefined
      const displayName = j.displayName as string | undefined
      const error = j.error as Record<string, unknown> | undefined
      const completionStats = j.completionStats as Record<string, unknown> | undefined
      const src = j.src as Record<string, unknown> | undefined
      const dest = j.dest as Record<string, unknown> | undefined

      console.log(`\n[${i + 1}] name:         ${formatStr(name)}`)
      console.log(`    displayName:     ${formatStr(displayName)}`)
      console.log(`    state:           ${formatStr(state)}`)
      console.log(`    model:           ${formatStr(model)}`)
      console.log(`    createTime:      ${formatStr(createTime)}`)
      console.log(`    updateTime:      ${formatStr(updateTime)}`)
      console.log(`    startTime:       ${formatStr(startTime)}`)
      console.log(`    endTime:         ${formatStr(endTime)}`)
      if (completionStats && Object.keys(completionStats).length > 0) {
        console.log(`    completionStats: ${JSON.stringify(completionStats)}`)
      }
      if (error && Object.keys(error).length > 0) {
        console.log(`    error:           ${JSON.stringify(error)}`)
      }
      if (src && Object.keys(src).length > 0) {
        console.log(`    src:             ${JSON.stringify(src).slice(0, 120)}${JSON.stringify(src).length > 120 ? "…" : ""}`)
      }
      if (dest && Object.keys(dest).length > 0) {
        console.log(`    dest:            ${JSON.stringify(dest).slice(0, 120)}${JSON.stringify(dest).length > 120 ? "…" : ""}`)
      }
      console.log("—".repeat(60))
    }

    console.log("")
  } catch (err) {
    console.error("Error listing Gemini batches:", err)
    console.log("")
  }
}

async function main() {
  try {
    await listDbBatches()
    await listGeminiBatches()
  } catch (error) {
    console.error("Error:", error)
    throw error
  }
}

main()
  .then(() => {
    console.log("Done")
    process.exit(0)
  })
  .catch(() => {
    process.exit(1)
  })
