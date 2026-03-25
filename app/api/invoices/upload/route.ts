import { NextRequest, NextResponse } from "next/server";
import { withAuthHandler } from "@/lib/api-middleware";
import { prisma } from "@/lib/db";
import { createBatchProcessing, processInvoicesFromR2Keys, updateBatchProgress } from "@/lib/actions/invoices";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2-client";
import Busboy from "busboy";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import * as unzipper from "unzipper";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_UPLOAD_FILE_SIZE = 500 * 1024 * 1024; // must match invoices.ts
const MAX_FILES_PER_UPLOAD = 5000; // must match invoices.ts

function isPdfName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function isZipName(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".zip");
}

function safeBaseName(name: string): string {
  const base = path.basename(name || "file");
  // Keep it simple: collapse path separators and weird chars.
  return base.replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "file";
}

async function uploadStreamToR2(params: {
  key: string;
  contentType: string;
  body: Readable;
  metadata?: Record<string, string>;
}): Promise<void> {
  await uploadToR2({
    key: params.key,
    body: params.body,
    contentType: params.contentType,
    metadata: params.metadata,
  });
}

async function streamZipToR2(params: {
  zipStream: Readable;
  batchId: string;
  uploadPrefix: string;
  r2Keys: string[];
  keySet: Set<string>;
  onPdfUploaded: (key: string) => Promise<void>;
}): Promise<void> {
  const directory = params.zipStream.pipe(
    (unzipper as unknown as typeof unzipper).Parse({ forceStream: true })
  ) as unknown as AsyncIterable<{
    path: string;
    type: string;
    autodrain: () => void;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  }>;

  let extracted = 0;

  for await (const entry of directory as AsyncIterable<any>) {
    const entryPath: string = String(entry.path || "");
    const lowerPath = entryPath.toLowerCase();

    if (entry.type !== "File" || !lowerPath.endsWith(".pdf")) {
      entry.autodrain();
      continue;
    }

    extracted += 1;
    if (params.r2Keys.length >= MAX_FILES_PER_UPLOAD) {
      entry.autodrain();
      continue;
    }

    const fileName = safeBaseName(entryPath) || `zip_entry_${extracted}.pdf`;
    const uniqueSuffix = randomUUID().slice(0, 8);
    const key = `${params.uploadPrefix}/${fileName.replace(/\.pdf$/i, "")}_${uniqueSuffix}.pdf`;

    if (params.keySet.has(key)) {
      entry.autodrain();
      continue;
    }

    params.keySet.add(key);

    await uploadStreamToR2({
      key,
      contentType: "application/pdf",
      body: entry as unknown as Readable,
      metadata: {
        uploadedAt: new Date().toISOString(),
        batchId: params.batchId,
        originalFileName: fileName,
        source: "zip",
      },
    });

    params.r2Keys.push(key);
    await params.onPdfUploaded(key);
  }
}

export const POST = withAuthHandler(async (request: NextRequest, user) => {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 is not configured. Streaming uploads require R2." },
      { status: 500 }
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data upload." },
      { status: 400 }
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: "No request body." }, { status: 400 });
  }

  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") || "async").toLowerCase();
  const isSync = mode === "sync";

  const batchId = await createBatchProcessing(0, undefined, user.id);
  await updateBatchProgress(batchId, { status: "PROCESSING", startedAt: new Date() });

  const uploadPrefix = batchId;
  const r2Keys: string[] = [];
  const keySet = new Set<string>();

  let bytesSeenTotal = 0;
  let finishedParsing = false;

  async function persistKeysAndCounts(): Promise<void> {
    await prisma.batchProcessing.update({
      where: { id: batchId },
      data: {
        r2Keys,
        totalFiles: r2Keys.length,
        updatedAt: new Date(),
      },
    });
  }

  const bb = Busboy({
    headers: Object.fromEntries(request.headers.entries()),
    limits: {
      files: MAX_FILES_PER_UPLOAD,
      fileSize: MAX_UPLOAD_FILE_SIZE,
    },
  });

  const uploadTasks: Array<Promise<void>> = [];
  let parseError: Error | null = null;

  bb.on("file", (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    const name = safeBaseName(filename);

    uploadTasks.push(
      (async () => {
        if (r2Keys.length >= MAX_FILES_PER_UPLOAD) {
          fileStream.resume();
          return;
        }

        if (isZipName(name) || mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
          const zipStream = fileStream as unknown as Readable;
          await streamZipToR2({
            zipStream,
            batchId,
            uploadPrefix,
            r2Keys,
            keySet,
            onPdfUploaded: async () => {
              if (r2Keys.length % 25 === 0) {
                await persistKeysAndCounts();
              }
            },
          });
          return;
        }

        if (!(isPdfName(name) || mimeType === "application/pdf")) {
          fileStream.resume();
          return;
        }

        const uniqueSuffix = randomUUID().slice(0, 8);
        const key = `${uploadPrefix}/${name.replace(/\.pdf$/i, "")}_${uniqueSuffix}.pdf`;

        if (keySet.has(key)) {
          fileStream.resume();
          return;
        }
        keySet.add(key);

        await uploadStreamToR2({
          key,
          contentType: "application/pdf",
          body: fileStream as unknown as Readable,
          metadata: {
            uploadedAt: new Date().toISOString(),
            batchId,
            originalFileName: name,
            source: "pdf",
          },
        });

        r2Keys.push(key);
        if (r2Keys.length % 25 === 0) {
          await persistKeysAndCounts();
        }
      })().catch((err) => {
        parseError = err instanceof Error ? err : new Error(String(err));
        fileStream.resume();
      })
    );
  });

  bb.on("field", (_name, _value) => {
    // no-op for now
  });

  bb.on("error", (err) => {
    parseError = err instanceof Error ? err : new Error(String(err));
  });

  bb.on("finish", () => {
    finishedParsing = true;
  });

  const nodeStream = Readable.fromWeb(request.body as unknown as NodeReadableStream<any>);
  nodeStream.on("data", (chunk) => {
    bytesSeenTotal += Buffer.byteLength(chunk);
  });

  nodeStream.on("error", (err) => {
    parseError = err instanceof Error ? err : new Error(String(err));
  });

  nodeStream.pipe(bb);

  while (!finishedParsing && !parseError) {
    // Yield to event loop until busboy finishes
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 25));
    if (bytesSeenTotal > MAX_FILES_PER_UPLOAD * MAX_UPLOAD_FILE_SIZE) {
      parseError = new Error("Upload too large.");
      break;
    }
  }

  if (parseError) {
    await updateBatchProgress(batchId, {
      status: "FAILED",
      errors: [
        {
          kind: "DATABASE_ERROR",
          message: parseError.message,
          timestamp: new Date().toISOString(),
        },
      ],
      completedAt: new Date(),
      failedFiles: Math.max(1, r2Keys.length),
      processedFiles: 0,
    }).catch(() => {});
    return NextResponse.json({ error: parseError.message, batchId }, { status: 400 });
  }

  await Promise.all(uploadTasks);
  await persistKeysAndCounts();

  if (r2Keys.length === 0) {
    await updateBatchProgress(batchId, {
      status: "FAILED",
      errors: [
        {
          kind: "DATABASE_ERROR",
          message: "No PDFs found to process.",
          timestamp: new Date().toISOString(),
        },
      ],
      completedAt: new Date(),
      failedFiles: 1,
      processedFiles: 0,
    }).catch(() => {});
    return NextResponse.json(
      { error: "No PDFs found to process.", batchId },
      { status: 400 }
    );
  }

  // Processing will be wired in todo `process-from-keys`.
  if (!isSync) {
    void processInvoicesFromR2Keys(r2Keys, user.id, batchId).catch((err) => {
      console.error("[api/invoices/upload] Background processing failed:", err);
    });
    return NextResponse.json({ batchId, totalFiles: r2Keys.length });
  }

  const result = await processInvoicesFromR2Keys(r2Keys, user.id, batchId);
  return NextResponse.json(result);
});

