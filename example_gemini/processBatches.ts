import { prisma } from '@/lib/db'
import pLimit from 'p-limit';
import { GoogleGenAI } from "@google/genai";
import { decrypt } from '@/lib/utils';
import { MAX_CONCURRENT_BATCHES_PROCESSING } from './constants';
import { processDeferredValidationBatches } from './deferred-validation';
import { cleanupGeminiFiles } from './batch-utils';
import { processBatchResults } from './processBatchResults';
import { createNotification } from '@/lib/actions/notifications';

// Helper function to update parent extraction batches when validation batches finish (fail/cancel/expire)
async function updateParentExtractionBatchesOnValidationFailure(pdfUrls: string[], adminId: string) {
  try {
    // Find the original extraction batch items that have the same pdfUrls
    const originalBatchItems = await prisma.batchItem.findMany({
      where: {
        pdfUrl: { in: pdfUrls },
        batch: {
          purpose: 'EXTRACTION',
          adminId: adminId
        }
      },
      select: {
        id: true,
        batchId: true,
        pdfUrl: true
      }
    });

    if (originalBatchItems.length === 0) {
      console.log(`No parent extraction batch items found for validation batch PDFs: ${pdfUrls.join(', ')}`);
      return;
    }

    // Get unique batch IDs
    const extractionBatchIds = [...new Set(originalBatchItems.map(item => item.batchId))];

    for (const batchId of extractionBatchIds) {
      try {
        // Check if there are any remaining validation batches for this extraction batch
        const remainingValidationBatches = await prisma.aIBatch.findMany({
          where: {
            purpose: 'VALIDATION',
            adminId: adminId,
            status: { in: ['SUBMITTED', 'PROCESSING'] },
            batchItems: {
              some: {
                pdfUrl: { in: originalBatchItems.filter(item => item.batchId === batchId).map(item => item.pdfUrl) }
              }
            }
          },
          select: {
            id: true,
            status: true
          }
        });

        if (remainingValidationBatches.length === 0) {
          // No more validation batches are running, check if parent should be marked as completed/failed/cancelled/expired
          const extractionBatch = await prisma.aIBatch.findUnique({
            where: { id: batchId },
            select: { id: true, status: true }
          });

          if (extractionBatch && extractionBatch.status === 'PROCESSING') {
            // Check validation outcomes
            const validationBatchesForThisExtraction = await prisma.aIBatch.findMany({
              where: {
                purpose: 'VALIDATION',
                adminId: adminId,
                status: { in: ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'] },
                batchItems: {
                  some: {
                    pdfUrl: { in: originalBatchItems.filter(item => item.batchId === batchId).map(item => item.pdfUrl) }
                  }
                }
              },
              select: { id: true, status: true }
            });

            const completedValidationBatches = validationBatchesForThisExtraction.filter(vb => vb.status === 'COMPLETED');
            const failedValidationBatches = validationBatchesForThisExtraction.filter(vb => vb.status === 'FAILED');
            const cancelledValidationBatches = validationBatchesForThisExtraction.filter(vb => vb.status === 'CANCELLED');
            const expiredValidationBatches = validationBatchesForThisExtraction.filter(vb => vb.status === 'EXPIRED');

            // Determine parent status based on outcomes
            if (completedValidationBatches.length > 0) {
              // At least some validations succeeded → mark as COMPLETED
              await prisma.aIBatch.update({
                where: { id: batchId },
                data: {
                  status: 'COMPLETED',
                  errorMessage:
                    failedValidationBatches.length + cancelledValidationBatches.length + expiredValidationBatches.length > 0
                      ? `${failedValidationBatches.length + cancelledValidationBatches.length + expiredValidationBatches.length} of ${validationBatchesForThisExtraction.length} validation batches had issues, but ${completedValidationBatches.length} completed successfully`
                      : null,
                },
              });
              console.log(`[Parent Update] Marked extraction batch ${batchId} as COMPLETED - ${completedValidationBatches.length} completed, ${failedValidationBatches.length} failed, ${cancelledValidationBatches.length} cancelled, ${expiredValidationBatches.length} expired`);
            } else if (cancelledValidationBatches.length > 0) {
              // No completions and at least one cancellation → CANCELLED
              await prisma.aIBatch.update({
                where: { id: batchId },
                data: { status: 'CANCELLED', errorMessage: 'All validation batches were cancelled or none completed' },
              });
              console.log(`[Parent Update] Marked extraction batch ${batchId} as CANCELLED - no validation batches completed`);
            } else if (expiredValidationBatches.length > 0 && failedValidationBatches.length === 0) {
              // No completions, some expired, none failed → EXPIRED
              await prisma.aIBatch.update({ where: { id: batchId }, data: { status: 'EXPIRED', errorMessage: 'All validation batches expired or none completed' } });
              console.log(`[Parent Update] Marked extraction batch ${batchId} as EXPIRED - no validation batches completed`);
            } else if (failedValidationBatches.length > 0) {
              // All that finished are failures and no completions → FAILED
              await prisma.aIBatch.update({
                where: { id: batchId },
                data: { status: 'FAILED', errorMessage: 'All validation batches failed' },
              });
              console.log(`[Parent Update] Marked extraction batch ${batchId} as FAILED - all validation batches failed`);
              try {
                await createNotification({
                  userId: adminId,
                  message: `El procesamiento por lotes ha fallado completamente - todos los lotes de validación fallaron.`,
                  type: 'INVOICE_PROCESSING_FAILED',
                  relatedId: batchId,
                });
              } catch (notificationError) {
                console.error(`Failed to create notification for failed batch ${batchId}:`, notificationError);
              }
            }
          }
        } else {
          console.log(`[Parent Update] Extraction batch ${batchId} still has ${remainingValidationBatches.length} active validation batches`);
        }
      } catch (batchError) {
        console.error(`[Parent Update] Error checking extraction batch ${batchId}:`, batchError);
      }
    }
  } catch (error) {
    console.error('[Parent Update] Error updating parent extraction batches:', error);
  }
}

export async function processBatches() {
  try {
    // First, process deferred validation batches that might be ready
    await processDeferredValidationBatches();

    // Add a longer delay to avoid overwhelming the API right after deferred processing
    console.log('[BATCH-PROCESSING] Adding 3 second delay between deferred and active batch processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get batches that are submitted or processing and need status checking
    const activeBatches = await prisma.aIBatch.findMany({
      where: {
        status: { in: ['SUBMITTED', 'PROCESSING'] },
        jobId: { not: null }
      },
      select: {
        id: true,
        jobId: true,
        status: true,
        uploadedFileId: true,
        purpose: true,
        admin: { select: { id: true, geminiApiKey: true } },
        batchItems: true
      }
    });

    console.log(`Found ${activeBatches.length} active batches to check.`);
    if (activeBatches.length === 0) return;

    // Group batches by admin to process them separately
    const batchesByAdmin = activeBatches.reduce((acc, batch) => {
      const adminId = batch.admin.id;
      if (!acc[adminId]) acc[adminId] = [] as typeof activeBatches;
      acc[adminId].push(batch);
      return acc;
    }, {} as Record<string, typeof activeBatches>);

    // Process each admin's batches
    for (const [adminId, adminBatches] of Object.entries(batchesByAdmin)) {
      const adminBatchLimit = pLimit(Math.min(MAX_CONCURRENT_BATCHES_PROCESSING, 3));
      const adminProcessingPromises = adminBatches.map((batch, index) => adminBatchLimit(async () => {
        if (index > 0) {
          const staggerDelay = index * 2000; // 2 seconds between each batch per admin
          console.log(`[Batch ${batch.id}] Adding ${staggerDelay}ms stagger delay for admin batch processing...`);
          await new Promise(resolve => setTimeout(resolve, staggerDelay));
        }

        const apiKey = batch.admin.geminiApiKey ? decrypt(batch.admin.geminiApiKey) : null;
        if (!batch.jobId || !apiKey) {
          console.error(`[Batch ${batch.id}] Missing Gemini batch ID or API key. Skipping.`);
          return;
        }

        console.log(`[Batch ${batch.id}] Checking Gemini batch status: ${batch.jobId}`);
        try {
          const gemini = new GoogleGenAI({ apiKey });
          // Simple retry for batch status check
          let geminiBatch;
          let attempts = 0;
          while (attempts < 3) {
            try {
              geminiBatch = await gemini.batches.get({ name: batch.jobId! });
              break;
            } catch (error: any) {
              attempts++;
              if (attempts >= 3) throw error;
              if (error?.status === 429 || error?.error?.code === 429) {
                console.log(`[Batch ${batch.id}] Rate limit hit, waiting 3s before retry ${attempts}/3`);
                await new Promise(resolve => setTimeout(resolve, 3000));
              } else {
                throw error;
              }
            }
          }

          const batchState = (geminiBatch as any).state || 'UNKNOWN';
          console.log(`[Batch ${batch.id}] Gemini status: ${batchState}`);

          if (batch.status === 'SUBMITTED' && batchState === 'JOB_STATE_RUNNING') {
            await prisma.aIBatch.update({ where: { id: batch.id }, data: { status: 'PROCESSING' } });
            console.log(`[Batch ${batch.id}] Updated status to PROCESSING`);
            return; // Still processing, check again later
          }

          switch (batchState) {
            case 'JOB_STATE_PENDING':
            case 'JOB_STATE_RUNNING':
              console.log(`[Batch ${batch.id}] Still processing (${batchState}). Will check again later.`);
              return;

            case 'JOB_STATE_SUCCEEDED':
              console.log(`[Batch ${batch.id}] Batch completed! Processing results...`);
              await processBatchResults(batch, gemini, geminiBatch);
              if (batch.uploadedFileId) {
                await cleanupGeminiFiles(gemini, [batch.uploadedFileId]);
              }
              break;

            case 'JOB_STATE_FAILED':
            case 'JOB_STATE_EXPIRED':
            case 'JOB_STATE_CANCELLED': {
              const mappedStatus = batchState === 'JOB_STATE_FAILED' ? 'FAILED' : batchState === 'JOB_STATE_EXPIRED' ? 'EXPIRED' : 'CANCELLED';
              console.log(`[Batch ${batch.id}] Batch ${batchState}. Marking as ${mappedStatus}.`);
              await prisma.aIBatch.update({
                where: { id: batch.id },
                data: {
                  status: mappedStatus as any,
                  errorMessage: `Gemini batch ${batchState}${(geminiBatch as any).error ? `: ${JSON.stringify((geminiBatch as any).error)}` : ''}`
                }
              });
              await prisma.batchItem.updateMany({
                where: { batchId: batch.id },
                data: { processed: true, processedAt: new Date(), errorMessage: `Batch ${mappedStatus}` }
              });
              await prisma.pendingBatchInvoice.deleteMany({
                where: { pdfUrl: { in: batch.batchItems.map((bi: any) => bi.pdfUrl) } }
              });

              // Check if this is a validation batch and update parent extraction batches
              if (batch.purpose === 'VALIDATION') {
                await updateParentExtractionBatchesOnValidationFailure(batch.batchItems.map((bi: any) => bi.pdfUrl), batch.admin.id);
              }

              if (batch.uploadedFileId) {
                await cleanupGeminiFiles(gemini, [batch.uploadedFileId]);
              }
              break;

            }
            default:
              console.warn(`[Batch ${batch.id}] Unknown Gemini batch status: ${batchState}`);
              return;
          }
        } catch (error: any) {
          console.error(`[Batch ${batch.id}] Error checking Gemini batch:`, error);
          if (error?.status === 429 || error?.error?.code === 429) {
            console.log(`[Batch ${batch.id}] Hit rate limit during status check, will retry later`);
            return;
          }
          if (error instanceof Error && error.message.includes('401')) {
            await prisma.aIBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', errorMessage: 'Gemini authentication failed' } });
            try {
              await createNotification({ userId: batch.admin.id, message: `El procesamiento por lotes ha fallado debido a un error de autenticación con Gemini.`, type: 'INVOICE_PROCESSING_FAILED', relatedId: batch.id });
            } catch { }
          }
        }
      }));

      const adminResults = await Promise.allSettled(adminProcessingPromises);
      adminResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[Admin ${adminId} batch ${index}] Promise rejected:`, result.reason);
        }
      });

      if (Object.keys(batchesByAdmin).indexOf(adminId) < Object.keys(batchesByAdmin).length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('Finished checking all active batches.');

  } catch (error) {
    console.error('Error in processBatches cron job:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
  }
}

// Add main execution block for running directly
if (require.main === module) {
  console.log('Starting batch processing cron job...');
  processBatches()
    .catch(err => {
      console.error("Cron job failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      console.log('Batch processing cron job completed.');
    });
}