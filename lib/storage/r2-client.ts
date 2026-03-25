import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from "stream";
import { Upload } from "@aws-sdk/lib-storage";

// Initialize R2 client with S3-compatible API
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'invoice-retries';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Optional: Custom domain for R2 bucket

export interface UploadToR2Params {
    key: string;
    body: Readable | Uint8Array | Buffer | string;
    contentType: string;
    metadata?: Record<string, string>;
}

export interface DownloadFromR2StreamResult {
    stream: Readable;
    contentType?: string;
    contentLength?: number;
}

export async function uploadToR2(params: UploadToR2Params): Promise<void> {
    // Cloudflare R2 can reject aws-chunked uploads where decoded length is unknown.
    // For streams, use multipart upload to avoid `x-amz-decoded-content-length: undefined`.
    if (params.body instanceof Readable) {
        const uploader = new Upload({
            client: r2Client,
            queueSize: 2,
            partSize: 8 * 1024 * 1024,
            leavePartsOnError: false,
            params: {
                Bucket: BUCKET_NAME,
                Key: params.key,
                Body: params.body,
                ContentType: params.contentType,
                Metadata: params.metadata,
            },
        });
        await uploader.done();
        return;
    }

    await r2Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        Metadata: params.metadata,
    }));
}

export async function downloadFromR2AsStream(key: string): Promise<DownloadFromR2StreamResult> {
    const response = await r2Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    }));

    if (!response.Body) {
        throw new Error(`No body in R2 response for key: ${key}`);
    }

    // AWS SDK v3 returns a Node stream in Node runtime; type is broader.
    const stream = response.Body as unknown as Readable;

    return {
        stream,
        contentType: typeof response.ContentType === 'string' ? response.ContentType : undefined,
        contentLength: typeof response.ContentLength === 'number' ? response.ContentLength : undefined,
    };
}

/**
 * Upload a PDF file to Cloudflare R2 for permanent storage
 * @param file - PDF file to upload
 * @param batchId - Batch ID to organize files
 * @returns Object with R2 key and public URL
 */
export async function uploadPdfToR2(file: File, batchId: string): Promise<{ key: string; url: string }> {
    const key = `${batchId}/${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2({
        key,
        body: buffer,
        contentType: 'application/pdf',
        metadata: {
            uploadedAt: new Date().toISOString(),
            batchId: batchId,
            originalFileName: file.name,
        },
    });

    const url = getPublicUrl(key);
    return { key, url };
}

/**
 * Download a PDF file from R2
 * @param key - R2 object key
 * @returns File object reconstructed from R2
 */
export async function downloadPdfFromR2(key: string): Promise<File> {
    const { stream } = await downloadFromR2AsStream(key);
    const buffer = Buffer.from(await streamToByteArray(stream));
    const fileName = key.split('/').pop() || 'invoice.pdf';

    return new File([buffer], fileName, { type: 'application/pdf' });
}

async function streamToByteArray(stream: Readable): Promise<Uint8Array> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/**
 * Get public URL for a PDF in R2
 * @param key - R2 object key
 * @returns Public URL to access the PDF
 */
export function getPublicUrl(key: string): string {
    // If custom domain is configured, use it
    if (R2_PUBLIC_URL) {
        return `${R2_PUBLIC_URL}/${key}`;
    }

    // Otherwise, use R2 public URL format
    // Note: Bucket must have public access enabled or use signed URLs
    const endpoint = process.env.R2_ENDPOINT || '';
    const accountId = endpoint.split('//')[1]?.split('.')[0] || 'account';
    return `https://pub-${accountId}.r2.dev/${key}`;
}

/**
 * Delete a PDF file from R2
 * @param key - R2 object key to delete
 */
export async function deletePdfFromR2(key: string): Promise<void> {
    await r2Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    }));
}

/**
 * Get PDF URL from R2 key stored in database
 * @param key - R2 object key
 * @returns Public URL or null if key is invalid
 */
export function getPdfUrlFromKey(key: string | null | undefined): string | null {
    if (!key) return null;
    return getPublicUrl(key);
}

/**
 * Check if R2 is properly configured
 * @returns true if R2 is configured
 */
export function isR2Configured(): boolean {
    return !!(
        process.env.R2_ENDPOINT &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME
    );
}
