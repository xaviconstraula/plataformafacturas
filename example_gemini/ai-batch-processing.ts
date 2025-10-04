import fs from 'fs';
import path from 'path';
import { v4 } from 'uuid';
import { getPresignedDownloadUrl } from '@/lib/backblaze';
import { isImageFile } from '@/lib/image-to-pdf';
import { getExtractionPrompt, buildValidationPrompt } from './ai-prompts';
import { getExtractionSchema, getValidationSchema, validateGeminiSchema } from './types/ai-invoice';

import { fetchWithRetry } from './utils/ai-retry';


// AI Configuration Constants
const AI_TEMPERATURE = 0.2;

/**
 * Create batch request file for Gemini batch processing
 * This is the SINGLE SOURCE OF TRUTH for batch AI requests
 * Updated to send PDFs directly as base64 instead of images
 */
export async function createBatchRequestFile(
    items: Array<{ pdfUrl: string; pdfBase64: string; filename: string; selectedPages?: number[]; summaryModeOverride?: boolean; clientContext?: { name?: string; cif?: string } }>,
    summaryModeOverride?: boolean
): Promise<string> {
    const batchRequests = items.map(item => {
        const shouldUseSummary =
            typeof summaryModeOverride === 'boolean'
                ? summaryModeOverride
                : (item.summaryModeOverride ?? (item.selectedPages && item.selectedPages.length > 0 ? true : undefined));

        const aiClientContext = (item.selectedPages && item.selectedPages.length > 0) || typeof shouldUseSummary === 'boolean' || item.clientContext ? {
            selectedPages: item.selectedPages,
            pageSelectionNote: item.selectedPages && item.selectedPages.length > 0
                ? `This PDF was generated from selected pages [${item.selectedPages.join(', ')}] of a longer document. Focus on these pages only.`
                : undefined,
            summaryMode: shouldUseSummary,
            name: item.clientContext?.name,
            cif: item.clientContext?.cif,
        } : undefined;

        const prompt = getExtractionPrompt(aiClientContext);
        
        // Validate schema before using it
        const extractionSchema = getExtractionSchema();
        const validation = validateGeminiSchema(extractionSchema.schema);
        if (!validation.isValid) {
            console.error('Schema validation failed:', validation.errors);
            throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
        }
        
        const isImage = isImageFile(item.filename);
        const extension = (item.filename.split('.').pop() || '').toLowerCase();
        let mimeType = 'application/pdf';
        if (isImage) {
            mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        }

        // Gemini expects *raw* base64 without any data URI prefix. Some callers
        // (e.g., older email ingestion code) may still prepend
        // `data:application/pdf;base64,`.  We sanitise it here to avoid blank /
        // malformed extraction results.

        const cleanBase64 = (() => {
            const match = item.pdfBase64.match(/^data:[^;]+;base64,(.*)$/);
            return match ? match[1] : item.pdfBase64;
        })();

        return {
            key: item.pdfUrl, // This should be a key, not a URL - caller responsibility
            request: {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: cleanBase64
                            }
                        }
                    ]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: getExtractionSchema().schema,
                    temperature: AI_TEMPERATURE,
                    // Additional constraints for JSON reliability
                    candidateCount: 1
                }
            }
        };
    });

    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    const filePath = path.join(tmpDir, `batch_${v4()}.jsonl`);

    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
        stream.on('open', () => {
            try {
                for (let i = 0; i < batchRequests.length; i++) {
                    const req = batchRequests[i];
                    stream.write(JSON.stringify(req) + '\n');
                }
                stream.end();
            } catch (error) {
                reject(error);
            }
        });
        stream.on('finish', () => {
            resolve(filePath);
        });
        stream.on('error', (error) => {
            reject(error);
        });
    });
}

// ---------------------------------------------------------------------------
// 🆕  Batch file builder that downloads files and sends as base64 ⚡️
// ---------------------------------------------------------------------------


export async function createBatchRequestFileFromUrls(
  items: Array<{ fileKey: string; filename: string; selectedPages?: number[]; summaryModeOverride?: boolean; clientContext?: { name?: string; cif?: string }, overrides?: { temperature?: number } }>
): Promise<string> {
  // Build requests
  const batchRequests = await Promise.all(
    items.map(async (item) => {
      const fileUrl = await getPresignedDownloadUrl(item.fileKey);
      
      // Download the file with retry logic for Backblaze
      const fileResponse = await fetchWithRetry(fileUrl);

      if (!fileResponse.ok) {
        const errorText = await fileResponse.text().catch(() => 'No error details');
        throw new Error(`Failed to download file ${item.fileKey} from Backblaze URL (${fileResponse.status} ${fileResponse.statusText}): ${errorText}`);
      }
      
      const fileBuffer = await fileResponse.arrayBuffer();
      const fileBase64 = Buffer.from(fileBuffer).toString('base64');

      // Determine MIME type based on file extension
      const isImage = isImageFile(item.filename);
      const extension = (item.filename.split('.').pop() || '').toLowerCase();
      let mimeType = 'application/pdf';
      if (isImage) {
        mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
      }
      
      // Prepare context for summary mode, selected pages, and client information
      const aiClientContext = (item.selectedPages && item.selectedPages.length > 0) || item.summaryModeOverride || item.clientContext ? {
        selectedPages: item.selectedPages,
        pageSelectionNote: item.selectedPages && item.selectedPages.length > 0
          ? `This PDF was pre-processed client-side and contains only selected pages [${item.selectedPages.join(', ')}] from the original document. Focus on these pages only.`
          : undefined,
        summaryMode: item.summaryModeOverride,
        name: item.clientContext?.name,
        cif: item.clientContext?.cif
      } : undefined;
      
      if (item.clientContext) {
        console.log(`[AI_CONTEXT_DEBUG] Processing ${item.filename} with client context:`, {
          originalContext: item.clientContext,
          finalAiContext: aiClientContext
        });
      }
      
      const prompt = getExtractionPrompt(aiClientContext);

      return {
        key: item.fileKey,
        request: {
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: fileBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: getExtractionSchema().schema,
            temperature: item.overrides?.temperature ?? AI_TEMPERATURE,
            // Force more deterministic and structured output
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192,
            // Additional constraints for JSON reliability  
            candidateCount: 1
          }
        }
      };
    })
  );

  // Write jsonl tmp file
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `batch_url_${v4()}.jsonl`);

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.on('open', () => {
      try {
        batchRequests.forEach((req) => stream.write(JSON.stringify(req) + '\n'));
        stream.end();
      } catch (err) {
        reject(err);
      }
    });
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

/**
 * Generate a JSONL file suitable for the Gemini batch endpoint for validation jobs.
 * Each item corresponds 1-to-1 with an invoice that already has extracted data.
 * Returns the absolute path to the generated temporary jsonl file.
 */
export async function createValidationBatchRequestFile(items: Array<{ pdfUrl: string; extractedData: any; invoiceType: 'INVOICE' | 'PURCHASE' }>): Promise<string> {
    const batchRequests = items.map(({ pdfUrl, extractedData, invoiceType }) => {
        const prompt = buildValidationPrompt(extractedData, invoiceType);
        
        return {
            key: pdfUrl, // This should be a key, not a URL - caller responsibility
            request: {
              contents: [{
                role: 'user',
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: getValidationSchema().schema,
                temperature: AI_TEMPERATURE,
                // Force more deterministic and structured output
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2048,
                // Additional constraints for JSON reliability
                candidateCount: 1
              }
            }
        };
    });

    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    const filePath = path.join(tmpDir, `validation_batch_${v4()}.jsonl`);

    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
        stream.on('open', () => {
            try {
                for (const req of batchRequests) {
                    stream.write(JSON.stringify(req) + '\n');
                }
                stream.end();
            } catch (error) {
                reject(error);
            }
        });
        stream.on('finish', () => resolve(filePath));
        stream.on('error', (err) => reject(err));
    });
}
