import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { Prisma, type BatchStatus } from '@/generated/prisma/client';
import { extractPdfFileName, decrypt } from '@/lib/utils';
import { convertExtractedDataToInvoiceData, type ExtractedInvoiceData } from '@/lib/ai-invoice-processing';
import { evaluateInvoiceErrors } from '@/lib/utils/invoice-validation';
import { normalizeCIF, createCifMatchingConditions } from '@/lib/utils/cif-utils';
import { createUnassignedInvoice } from '@/lib/actions/invoices';
import { populateHistoricExpensesAccount, populateHistoricTaxes } from '@/lib/expenses-account-utils';
import { v4 } from 'uuid';
import { createValidationBatchRequestFile } from '@/lib/ai-invoice-processing';
import { AI_MODEL } from './ai-config';
import { parseJsonLinesFromFile } from '@/lib/utils/jsonl-parser';
import { executeBatchOperations, BatchOperations, safeUnlink, getGeminiResponseText } from './batch-utils';
import { BATCH_SIZE } from './constants';
import { createInvoiceRecord } from '@/lib/actions/invoices-cron';
import { incrementInvoiceCounter } from '@/lib/utils/invoice-counters';

export async function processBatchResults(batch: any, gemini: GoogleGenAI, geminiBatch: any) {
  try {
    // Track whether we are handling a VALIDATION result batch and which extraction batches are parents
    let isValidationResults = false;
    const parentBatchIds = new Set<string>();
    const parseJsonString = (rawInput: string, context?: string): any | null => {
      if (!rawInput) return null;
      let raw = rawInput.trim();
      if (raw.startsWith('```')) {
        raw = raw.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
      }
      raw = raw.replace(/[\uFEFF\u200B-\u200D]/g, '');
      if (raw.startsWith('{\\')) {
        raw = raw
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
      }
      try { return JSON.parse(raw); } catch {}
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = raw.slice(start, end + 1);
        try { return JSON.parse(slice); } catch {}
      }
      if (context) console.error(`[Batch ${batch.id}] Failed to parse JSON in ${context}. First 200 chars:`, raw.substring(0, 200));
      return null;
    };

    let results: any[] = [];

    if (geminiBatch.dest && (geminiBatch.dest.file_name || geminiBatch.dest.fileName)) {
      const fileName = geminiBatch.dest.file_name ?? geminiBatch.dest.fileName;
      console.log(`[Batch ${batch.id}] Downloading results from file: ${fileName}`);
      const tmpDir = path.join(process.cwd(), 'tmp');
      await fs.promises.mkdir(tmpDir, { recursive: true });
      let downloadedPath: string;
      try {
        downloadedPath = path.join(tmpDir, path.basename(fileName));
        await gemini.files.download({ file: fileName, downloadPath: downloadedPath });
        if (!await fs.promises.access(downloadedPath).then(() => true).catch(() => false)) {
          try {
            const files = await fs.promises.readdir(tmpDir);
            console.log(`[Batch ${batch.id}] Expected file: ${downloadedPath}, Available files: ${files.join(', ')}`);
            const fileStats = await Promise.all(files.map(async (file) => {
              try { const fullPath = path.join(tmpDir, file); const stats = await fs.promises.stat(fullPath); return { file, fullPath, mtime: stats.mtime, isFile: stats.isFile() }; }
              catch { return null; }
            }));
            const validFiles = fileStats.filter(s => s !== null && s.isFile) as Array<{ file: string; fullPath: string; mtime: Date; isFile: boolean; }>;
            const expectedBaseName = path.basename(fileName);
            const matchingFiles = validFiles.filter(f => f.file === expectedBaseName || f.file.includes(expectedBaseName.split('.')[0]));
            const recentJsonlFiles = validFiles.filter(f => f.file.endsWith('.jsonl') && (Date.now() - f.mtime.getTime()) < 10 * 60 * 1000);
            let selectedFile: typeof validFiles[0] | null = null;
            if (matchingFiles.length > 0) {
              selectedFile = matchingFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
              console.log(`[Batch ${batch.id}] Using matching file: ${selectedFile.file}`);
            } else if (recentJsonlFiles.length === 1) {
              selectedFile = recentJsonlFiles[0];
              console.log(`[Batch ${batch.id}] Using recent .jsonl file: ${selectedFile.file}`);
            } else if (recentJsonlFiles.length > 1) {
              throw new Error(`Multiple recent .jsonl files found, cannot determine which belongs to batch ${batch.id}. Files: ${recentJsonlFiles.map(f => f.file).join(', ')}`);
            } else {
              throw new Error(`No suitable batch result file found for batch ${batch.id}. Expected: ${expectedBaseName}, Available: ${files.join(', ')}`);
            }
            downloadedPath = selectedFile.fullPath;
            console.log(`[Batch ${batch.id}] Selected file: ${downloadedPath}`);
          } catch (dirErr) {
            throw new Error(`Failed to process tmp directory ${tmpDir}: ${dirErr instanceof Error ? dirErr.message : 'Unknown error'}`);
          }
        }
        try { const stats = await fs.promises.stat(downloadedPath); if (stats.isDirectory()) { throw new Error(`Downloaded path ${downloadedPath} is a directory, not a file`); } } 
        catch (statErr) { throw new Error(`Cannot access file stats for ${downloadedPath}: ${statErr instanceof Error ? statErr.message : 'Unknown error'}`); }
        console.log(`[Batch ${batch.id}] Using streaming parser for ${downloadedPath}`);
        try { results = await parseJsonLinesFromFile(downloadedPath); console.log(`[Batch ${batch.id}] Successfully parsed ${results.length} results using streaming parser`); }
        catch (readErr) { throw new Error(`Failed to parse file ${downloadedPath}: ${readErr instanceof Error ? readErr.message : 'Unknown error'}`); }

        // Clean up the downloaded file after successful processing
        try {
          await fs.promises.unlink(downloadedPath);
          console.log(`[Batch ${batch.id}] Cleaned up downloaded result file: ${downloadedPath}`);
        } catch (cleanupErr) {
          console.warn(`[Batch ${batch.id}] Failed to clean up downloaded result file ${downloadedPath}:`, cleanupErr);
        }
      } catch (dlErr) {
        console.error(`[Batch ${batch.id}] Failed to download or read result file`, dlErr);
        throw dlErr;
      }
      try {
        const files = await fs.promises.readdir(tmpDir);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        for (const file of files) {
          try { const filePath = path.join(tmpDir, file); const stats = await fs.promises.stat(filePath); if (stats.isFile() && stats.mtime.getTime() < oneHourAgo) { await safeUnlink(filePath); console.log(`[Batch ${batch.id}] Cleaned up old tmp file: ${file}`); } } catch {}
        }
      } catch {}
    } else if (geminiBatch.dest && (geminiBatch.dest.inlined_responses || geminiBatch.dest.inlinedResponses)) {
      const inlined = geminiBatch.dest.inlined_responses ?? geminiBatch.dest.inlinedResponses;
      console.log(`[Batch ${batch.id}] Processing inline results`);
      results = inlined.map((inlineResponse: any, index: number) => ({
        key: inlineResponse.key ?? `inline-${index}`,
        response: inlineResponse.response ? { text: inlineResponse.response.text } : null,
        error: inlineResponse.error || null
      }));
    } else {
      console.warn(`[Batch ${batch.id}] No results found in Gemini batch response (neither file nor inline). Marking batch as FAILED.`);
      await prisma.aIBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', errorMessage: 'Gemini batch succeeded but returned no results.' } });
      return;
    }

    console.log(`[Batch ${batch.id}] Processing ${results.length} results`);
    let successCount = 0; let errorCount = 0; const errorDetails: string[] = [];
    const batchOps: BatchOperations = { batchItemUpdates: [], pendingInvoiceDeletions: [], notifications: [], deferredValidations: [] };
    const validationQueue: Array<{ pdfUrl: string; extractedData: ExtractedInvoiceData; invoiceType: 'INVOICE' | 'PURCHASE' }> = [];
    const seenPdfUrls = new Set<string>();

    for (const result of results) {
      const pdfUrl = result.key;
      
      // Wrap each item processing in a try-catch to ensure batch continues even with unexpected errors
      try {
        if (seenPdfUrls.has(pdfUrl)) { console.warn(`[Batch ${batch.id}] Duplicate result detected for ${pdfUrl}. Skipping.`); continue; }
        seenPdfUrls.add(pdfUrl);
        const aiRaw = getGeminiResponseText(result.response);
        if (!aiRaw) { console.warn(`[Batch ${batch.id}] No AI response content for ${pdfUrl}`); continue; }
        let parsedResponse: any = null;
        try { parsedResponse = parseJsonString(aiRaw, 'AI response'); } catch (parseErr) { console.error(`[Batch ${batch.id}] Failed to parse AI response for ${pdfUrl}:`, parseErr); continue; }
        if (!parsedResponse) { console.warn(`[Batch ${batch.id}] Could not parse AI response for ${pdfUrl}`); continue; }
      if (typeof parsedResponse.isValid === 'boolean') {
        // We are processing VALIDATION results (not extraction)
        isValidationResults = true;
        console.log(`[Batch ${batch.id}] Processing validation result for ${pdfUrl}: isValid=${parsedResponse.isValid}`);
        const originalBatchItem = await prisma.batchItem.findFirst({ where: { pdfUrl, extractedInvoiceData: { not: Prisma.DbNull } }, select: { id: true, extractedInvoiceData: true, batchId: true } });
        if (originalBatchItem && originalBatchItem.extractedInvoiceData) {
          const storedData = originalBatchItem.extractedInvoiceData as any;
          const preValidationErrors = storedData.preValidationErrors || [];
          const validationError = parsedResponse.isValid ? null : parsedResponse.message;
          const combinedErrors = validationError ? [...preValidationErrors, validationError] : preValidationErrors;
          const hasError = combinedErrors.length > 0;
          const finalInvoiceData = { ...storedData, hasError, errors: combinedErrors };
          delete (finalInvoiceData as any).selectedClientInfo;
          delete (finalInvoiceData as any).extractedData;
          delete (finalInvoiceData as any).preValidationErrors;
          
          try {
            await createInvoiceRecord(finalInvoiceData);
            console.log(`[Batch ${batch.id}] Created invoice from stored data for ${pdfUrl}: isValid=${parsedResponse.isValid}, hasError=${hasError}`);
          } catch (invoiceError) {
            const errorMessage = invoiceError instanceof Error ? invoiceError.message : 'Unknown error creating invoice';
            console.error(`[Batch ${batch.id}] Failed to create invoice for ${pdfUrl}: ${errorMessage}`);
            
            // Check if it's a duplicate error - handle gracefully and don't count as failure
            const isDuplicate = errorMessage.includes('Factura duplicada') || errorMessage.includes('Factura Duplicada') || errorMessage.includes('Duplicada') || errorMessage.includes('duplicada');
            if (isDuplicate) {
              console.log(`[Batch ${batch.id}] Duplicate invoice detected for ${pdfUrl}, marking as processed but not counting as error`);

              // Record duplicate event using InvoiceEvent model for audit trail
              // Use the client user ID (storedData.userId) instead of admin ID
              await incrementInvoiceCounter(
                storedData.userId,
                'duplicate',
                'BATCH',
                storedData.pageCount ?? 0
              );

              // Add notification for duplicate detection
              batchOps.notifications.push({
                userId: batch.admin.id,
                message: `Factura duplicada detectada y omitida: ${storedData.fileName || 'Sin nombre'} - ${errorMessage}`,
                type: 'INVOICE_DISCARDED_DUPLICATE',
                relatedId: originalBatchItem.id,
              });
              // For duplicates, we don't count as error - the invoice was already processed before
            } else {
              // For other errors, add failure notification and count as error
              errorCount++;
              const errorMsg = `${pdfUrl}: ${errorMessage}`;
              errorDetails.push(errorMsg);

              // Record failed event using InvoiceEvent model for audit trail
              // Use the client user ID (storedData.userId) instead of admin ID
              await incrementInvoiceCounter(
                storedData.userId,
                'failed',
                'BATCH',
                storedData.pageCount ?? 0
              );

              batchOps.notifications.push({
                userId: batch.admin.id,
                message: `Error creando factura '${storedData.fileName || 'Sin nombre'}': ${errorMessage}`,
                type: 'INVOICE_PROCESSING_FAILED',
                relatedId: originalBatchItem.id,
              });
            }
          }
          
          batchOps.batchItemUpdates.push({ id: originalBatchItem.id, data: { extractedInvoiceData: Prisma.DbNull } });
          if (originalBatchItem.batchId) { parentBatchIds.add(originalBatchItem.batchId); }
          batchOps.pendingInvoiceDeletions.push(pdfUrl);
        } else {
          console.warn(`[Batch ${batch.id}] Validation result received but no stored extraction data found for ${pdfUrl}.`);
        }
        const validationBatchItem = batch.batchItems.find((bi: any) => bi.pdfUrl === pdfUrl);
        if (validationBatchItem) { batchOps.batchItemUpdates.push({ id: validationBatchItem.id, data: { processed: true, processedAt: new Date(), errorMessage: null } }); }
        successCount++; continue;
      }

      const extractedData = parsedResponse;
      const batchItem = batch.batchItems.find((item: any) => item.pdfUrl === pdfUrl);
      if (!batchItem) { console.warn(`[Batch ${batch.id}] No batch item found for PDF: ${pdfUrl}`); continue; }

      await prisma.$transaction(async (tx) => {
        const itemOps: { batchItemUpdates: Array<{ id: string; data: any }>; pendingInvoiceDeletions: Array<string>; } = { batchItemUpdates: [], pendingInvoiceDeletions: [] };
        try {
          if (result.error) { throw new Error(`Gemini request failed: ${JSON.stringify(result.error)}`); }
          console.log(`[Batch ${batch.id}] Extracted data:`, { invoiceNumber: extractedData.invoiceNumber, issueDate: extractedData.issueDate, items: extractedData.items, providerCif: extractedData.providerCif, clientCif: extractedData.clientCif, providerName: extractedData.providerName, clientName: extractedData.clientName });
          let vatExemptItems: any[] = [];
          if (extractedData.items && Array.isArray(extractedData.items)) {
            vatExemptItems = extractedData.items.filter((item: any) => item.taxes && Array.isArray(item.taxes) && item.taxes.some((tax: string) => tax.includes('iva_0') || tax.toLowerCase() === 'exenta'));
            if (vatExemptItems.length > 0) { console.log(`[Batch ${batch.id}] AI response contains ${vatExemptItems.length} VAT exempt items:`, vatExemptItems.map((item: any) => ({ description: item.description, taxes: item.taxes }))); }
          }

          const invoiceData = convertExtractedDataToInvoiceData(extractedData);
          let allErrors: string[] = [];
          console.log(`[Batch ${batch.id}] Searching for client with CIF: Provider='${invoiceData.cifProvider}' OR Client='${invoiceData.cifClient}'`);
          console.log(`[Batch ${batch.id}] Admin ID: ${batch.admin.id}`);
          const providerCifRaw = invoiceData.cifProvider; const buyerCifRaw = invoiceData.cifClient;
          const providerCifNorm = normalizeCIF(providerCifRaw); const buyerCifNorm = normalizeCIF(buyerCifRaw);
          const [providerMatch, buyerMatch] = await Promise.all([
            prisma.user.findFirst({ where: { createdById: batch.admin.id, OR: [...createCifMatchingConditions(providerCifRaw), ...createCifMatchingConditions(providerCifNorm)] }, select: { id: true, cif: true, name: true } }),
            prisma.user.findFirst({ where: { createdById: batch.admin.id, OR: [...createCifMatchingConditions(buyerCifRaw), ...createCifMatchingConditions(buyerCifNorm)] }, select: { id: true, cif: true, name: true } })
          ]);

          let selectedClient: typeof providerMatch | typeof buyerMatch | null = null;
          let invoiceType: 'INVOICE' | 'PURCHASE' | null = null;
          if (providerMatch && !buyerMatch) { selectedClient = providerMatch; invoiceType = 'INVOICE'; }
          else if (buyerMatch && !providerMatch) { selectedClient = buyerMatch; invoiceType = 'PURCHASE'; }
          else if (providerMatch && buyerMatch) { console.warn(`[Batch ${batch.id}] Ambiguous CIF match: provider (${providerMatch.cif}) and buyer (${buyerMatch.cif}) are both clients. Defaulting to buyer as PURCHASE.`); selectedClient = buyerMatch; invoiceType = 'PURCHASE'; }

          if (!selectedClient) {
            const possible = await prisma.user.findMany({ where: { createdById: batch.admin.id, role: 'CLIENT', OR: [ { name: { equals: extractedData.providerName, mode: 'insensitive' } }, { name: { equals: extractedData.clientName, mode: 'insensitive' } } ] }, select: { id: true, cif: true, name: true } });
            if (possible.length === 1) { selectedClient = possible[0]; invoiceType = selectedClient.name.toLowerCase() === (extractedData.providerName || '').toLowerCase() ? 'INVOICE' : 'PURCHASE'; console.log(`[Batch ${batch.id}] Matched client by NAME '${selectedClient.name}' (invoiceType=${invoiceType}).`); }
          }

          if (!selectedClient) {
            const pending = await prisma.pendingBatchInvoice.findFirst({ where: { pdfUrl }, select: { clientId: true } });
            if (pending) {
              const pendingUser = await prisma.user.findUnique({ where: { id: pending.clientId }, select: { id: true, cif: true, name: true, role: true } });
              if (pendingUser && pendingUser.role === 'CLIENT') {
                selectedClient = pendingUser;
                invoiceType = pendingUser.cif && pendingUser.cif.toUpperCase() === providerCifNorm ? 'INVOICE' : 'PURCHASE';
                console.log(`[Batch ${batch.id}] Fallback matched client via PendingBatchInvoice for PDF ${pdfUrl} (invoiceType=${invoiceType}).`);
              }
            }
          }

          if (!selectedClient || !invoiceType) {
            const isClearlyEmptyUnassigned = (!invoiceData.invoiceNum?.trim() && invoiceData.items.length === 0);
            await createUnassignedInvoice({ adminId: batch.admin.id, pdfUrl, fileName: extractPdfFileName(pdfUrl), extractedData });
            itemOps.batchItemUpdates.push({ id: batchItem.id, data: { processed: true, processedAt: new Date(), errorMessage: 'UNASSIGNED_INVOICE', rawExtractionResult: aiRaw ?? null } });
            console.log(`[Batch ${batch.id}] Stored unassigned invoice for PDF ${pdfUrl}`);
            itemOps.pendingInvoiceDeletions.push(pdfUrl);
            successCount++; return; 
          }

          if (!validationQueue.some(v => v.pdfUrl === pdfUrl) && invoiceType) { validationQueue.push({ pdfUrl, extractedData, invoiceType }); }

          const completedInvoiceData = { ...convertExtractedDataToInvoiceData(extractedData) } as ReturnType<typeof convertExtractedDataToInvoiceData>;
          if (!selectedClient) { console.error(`[Batch ${batch.id}] No client found for invoice processing`); throw new Error('Client resolution failed'); }
          if (invoiceType === 'PURCHASE') {
            if (!completedInvoiceData.cifClient || completedInvoiceData.cifClient.trim() === '') { completedInvoiceData.cifClient = selectedClient.cif ?? ''; }
            if (!completedInvoiceData.client || completedInvoiceData.client.trim() === '') { completedInvoiceData.client = selectedClient.name || ''; }
          } else if (invoiceType === 'INVOICE') {
            if (!completedInvoiceData.cifProvider || completedInvoiceData.cifProvider.trim() === '') { completedInvoiceData.cifProvider = selectedClient.cif ?? ''; }
            if (!completedInvoiceData.contactName || completedInvoiceData.contactName.trim() === '') { completedInvoiceData.contactName = selectedClient.name || ''; }
          }

          allErrors = evaluateInvoiceErrors({ invoiceData: completedInvoiceData, extractedData }).allErrors;
          const hasError = allErrors.length > 0;
          let decryptedHoldedKey: string | null = null;
          try {
            const clientWithBilling = await prisma.user.findUnique({ where: { id: selectedClient.id }, select: { billingSoftwareConfig: { select: { holdedApiKey: true } } } });
            decryptedHoldedKey = clientWithBilling?.billingSoftwareConfig?.holdedApiKey ? decrypt(clientWithBilling.billingSoftwareConfig.holdedApiKey) : null;
          } catch {}
          if (invoiceType === 'PURCHASE') {
            try { await populateHistoricExpensesAccount(completedInvoiceData, invoiceType, decryptedHoldedKey); console.log(`[Batch ${batch.id}] Applied shared expenses account population logic`); } 
            catch (err) { console.warn(`[Batch ${batch.id}] Could not populate historic expenses account:`, err); }
          }
          try { if (invoiceType) { await populateHistoricTaxes(completedInvoiceData, invoiceType, decryptedHoldedKey); } } 
          catch (err) { console.warn(`[Batch ${batch.id}] Could not populate historic taxes:`, err); }

          const invoiceCreationData = { ...completedInvoiceData, type: invoiceType!, pdfUrl, userId: selectedClient.id, hasError, errors: allErrors, selectedClientInfo: { id: selectedClient.id, cif: selectedClient.cif, name: selectedClient.name }, extractedData, preValidationErrors: allErrors };
          const isClearlyEmpty = (!completedInvoiceData.invoiceNum?.trim() && completedInvoiceData.items.length === 0);
          if (isClearlyEmpty) {
            console.error(`[Batch ${batch.id}] Empty extraction for ${pdfUrl} — marking as failed (missing invoice number or items)`);
            batchOps.batchItemUpdates.push({ id: batchItem.id, data: { processed: true, processedAt: new Date(), errorMessage: 'Empty extraction (missing invoice number or lines)', rawExtractionResult: aiRaw } });
            batchOps.notifications.push({ userId: batch.admin.id, message: `No se pudo extraer datos de la factura '${extractPdfFileName(pdfUrl)}' - extracción vacía. ID del elemento: ${batchItem.id}` , type: 'INVOICE_PROCESSING_FAILED', relatedId: batchItem.id });
          } else {
            itemOps.batchItemUpdates.push({ id: batchItem.id, data: { extractedInvoiceData: invoiceCreationData, processed: true, processedAt: new Date() } });
          }

          if (vatExemptItems.length > 0) { console.log(`[Batch ${batch.id}] VAT exempt items will be stored with ${invoiceType === 'INVOICE' ? 's_' : 'p_'}iva_0 tax codes`); }
          for (const update of itemOps.batchItemUpdates) { await tx.batchItem.update({ where: { id: update.id }, data: update.data }); }
          if (itemOps.pendingInvoiceDeletions.length > 0) { await tx.pendingBatchInvoice.deleteMany({ where: { pdfUrl: { in: itemOps.pendingInvoiceDeletions } } }); }
          successCount++; console.log(`[Batch ${batch.id}] Successfully processed result for ${pdfUrl}`);
        } catch (itemError: any) {
          const errorMessage = itemError instanceof Error ? itemError.message : 'Unknown error';
          const isDuplicate = errorMessage.includes('Factura duplicada') || errorMessage.includes('Factura Duplicada') || errorMessage.includes('Duplicada') || errorMessage.includes('duplicada');
          if (isDuplicate) {
            itemOps.batchItemUpdates.push({ id: batchItem.id, data: { processed: true, processedAt: new Date(), errorMessage: `Duplicate: ${errorMessage}` } });
            itemOps.pendingInvoiceDeletions.push(pdfUrl);
            successCount++; console.log(`[Batch ${batch.id}] Duplicate invoice detected for ${pdfUrl}: ${errorMessage}`);
          } else {
            itemOps.batchItemUpdates.push({ id: batchItem.id, data: { processed: true, processedAt: new Date(), errorMessage } });
            itemOps.pendingInvoiceDeletions.push(pdfUrl);
            batchOps.notifications.push({ userId: batch.admin.id, message: `Error al procesar la factura '${extractPdfFileName(pdfUrl)}': ${errorMessage}. ID del elemento: ${batchItem.id}`, type: 'INVOICE_PROCESSING_FAILED', relatedId: batchItem.id });
            errorCount++; errorDetails.push(`${pdfUrl}: ${errorMessage}`); console.error(`[Batch ${batch.id}] Error processing result for ${pdfUrl}:`, errorMessage);
          }
          for (const update of itemOps.batchItemUpdates) { await tx.batchItem.update({ where: { id: update.id }, data: update.data }); }
          if (itemOps.pendingInvoiceDeletions.length > 0) { await tx.pendingBatchInvoice.deleteMany({ where: { pdfUrl: { in: itemOps.pendingInvoiceDeletions } } }); }
        }
      });
      } catch (unexpectedError) {
        // Handle any unexpected errors during item processing to ensure batch continues
        errorCount++;
        const errorMsg = `Unexpected error processing ${pdfUrl}: ${unexpectedError instanceof Error ? unexpectedError.message : 'Unknown error'}`;
        errorDetails.push(errorMsg);
        console.error(`[Batch ${batch.id}] Unexpected error processing item ${pdfUrl}:`, unexpectedError);
        
        // Try to mark the item as failed if we can find it
        try {
          const batchItem = batch.batchItems.find((item: any) => item.pdfUrl === pdfUrl);
          if (batchItem) {
            await prisma.batchItem.update({
              where: { id: batchItem.id },
              data: {
                processed: true,
                processedAt: new Date(),
                errorMessage: errorMsg
              }
            });
          }
        } catch (updateError) {
          console.error(`[Batch ${batch.id}] Failed to update failed item ${pdfUrl}:`, updateError);
        }
      }
    }

    try { await executeBatchOperations(batchOps); console.log(`[Batch ${batch.id}] Executed batch operations: ${batchOps.batchItemUpdates.length} updates, ${batchOps.pendingInvoiceDeletions.length} deletions`); } 
    catch (batchOpError) { console.error(`[Batch ${batch.id}] Error executing batch operations:`, batchOpError); }

    const currentBatchItems = await prisma.batchItem.findMany({ where: { batchId: batch.id }, select: { id: true, pdfUrl: true, processed: true } });
    const missingItems = currentBatchItems.filter((bi: any) => !bi.processed);
    if (missingItems.length > 0) {
      console.warn(`[Batch ${batch.id}] ${missingItems.length} items missing in Gemini response - marking as failed`);
      const missingItemsOps: BatchOperations = {
        batchItemUpdates: missingItems.map((mi: any) => ({ id: mi.id, data: { processed: true, processedAt: new Date(), errorMessage: 'No Gemini result (missing in batch response)', rawExtractionResult: null } })),
        pendingInvoiceDeletions: [],
        notifications: missingItems.map((mi: any) => ({ userId: batch.admin.id, message: `No se pudo procesar la factura '${extractPdfFileName(mi.pdfUrl)}' - falta en la respuesta de Gemini. ID del elemento: ${mi.id}`, type: 'INVOICE_PROCESSING_FAILED', relatedId: mi.id })),
        deferredValidations: []
      };
      await executeBatchOperations(missingItemsOps);
    }

    let validationBatchesCreated = 0; let validationBatchesDeferred = 0;
    if (validationQueue.length > 0) {
      console.log(`[Batch ${batch.id}] Preparing ${validationQueue.length} invoices for validation batch`);
      for (let i = 0; i < validationQueue.length; i += BATCH_SIZE) {
        const slice = validationQueue.slice(i, i + BATCH_SIZE);
        let validationFilePath: string | null = null;
        try {
          validationFilePath = await createValidationBatchRequestFile(slice);
          
          // Simple retry for file upload
          let validationFile;
          let attempts = 0;
          while (attempts < 3) {
            try {
              validationFile = await gemini.files.upload({ file: validationFilePath, config: { displayName: `validation-batch-${v4()}`, mimeType: 'application/jsonl' } });
              break;
            } catch (error: any) {
              attempts++;
              if (attempts >= 3) throw error;
              if (error?.status === 429 || error?.error?.code === 429) {
                console.log(`[Batch ${batch.id}] Rate limit hit during file upload, waiting 2s before retry ${attempts}/3`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                throw error;
              }
            }
          }
          
          // Simple retry for batch creation
          let validationBatch;
          attempts = 0;
          while (attempts < 3) {
            try {
              validationBatch = await gemini.batches.create({ model: AI_MODEL, src: (validationFile as any).name || (validationFile as any).id || 'unknown', config: { displayName: `validation-job-${v4()}` } });
              break;
            } catch (error: any) {
              attempts++;
              if (attempts >= 3) throw error;
              if (error?.status === 429 || error?.error?.code === 429) {
                console.log(`[Batch ${batch.id}] Rate limit hit during batch creation, waiting 1s before retry ${attempts}/3`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                throw error;
              }
            }
          }
          
          await fs.promises.unlink(validationFilePath).catch(() => { });
          await prisma.aIBatch.create({ data: { adminId: batch.admin.id, jobId: (validationBatch as any).name, status: 'SUBMITTED', itemCount: slice.length, purpose: 'VALIDATION', uploadedFileId: (validationFile as any).name || (validationFile as any).id, batchItems: { createMany: { data: slice.map((s) => ({ pdfUrl: (s as any).pdfUrl, emailId: 'validation-batch', processed: false })) } } } });
          validationBatchesCreated++;
          console.log(`[Batch ${batch.id}] Launched validation sub-batch (${slice.length} items) – Gemini batch id ${(validationBatch as any).name}`);
          if (i + BATCH_SIZE < validationQueue.length) { 
            console.log(`[Batch ${batch.id}] Waiting 2s before creating next validation batch...`); 
            await new Promise(resolve => setTimeout(resolve, 2000)); 
          }
        } catch (valErr: any) {
          // Clean up validation file on any error
          if (validationFilePath) {
            try {
              await fs.promises.unlink(validationFilePath);
              console.log(`[Batch ${batch.id}] Cleaned up validation file after error: ${validationFilePath}`);
            } catch (cleanupErr) {
              console.warn(`[Batch ${batch.id}] Failed to clean up validation file ${validationFilePath}:`, cleanupErr);
            }
          }

          if (valErr?.status === 429 || valErr?.error?.code === 429) {
            console.log(`[Batch ${batch.id}] Rate limit hit during validation batch creation - deferring remaining ${validationQueue.length - i} items`);
            const remainingItems = validationQueue.slice(i);
            batchOps.deferredValidations.push(...remainingItems.map((item) => ({ ...item, adminId: batch.admin.id, batchId: batch.id })));
            validationBatchesDeferred += Math.ceil(remainingItems.length / BATCH_SIZE);
            break;
          } else {
            console.error(`[Batch ${batch.id}] Failed to create validation batch:`, valErr);
            for (const item of slice) {
              try {
                const originalBatchItem = await prisma.batchItem.findFirst({ where: { pdfUrl: item.pdfUrl, extractedInvoiceData: { not: Prisma.DbNull } } });
                if (originalBatchItem) {
                  await prisma.batchItem.update({ where: { id: originalBatchItem.id }, data: { processed: true, processedAt: new Date(), errorMessage: `Validation batch creation failed: ${valErr instanceof Error ? valErr.message : 'Unknown error'}` } });
                }
              } catch (updateErr) {
                console.error(`[Batch ${batch.id}] Failed to mark failed validation item as processed:`, updateErr);
              }
            }
          }
        }
      }
      console.log(`[Batch ${batch.id}] Validation summary: ${validationBatchesCreated} batches created, ${validationBatchesDeferred} batches deferred`);
    }

  let finalStatus: BatchStatus;
    if (successCount === 0) { finalStatus = 'FAILED'; }
    else if ((validationQueue.length > 0 && validationBatchesCreated > 0) || validationBatchesDeferred > 0) { finalStatus = 'PROCESSING'; console.log(`[Batch ${batch.id}] Keeping status as PROCESSING since ${validationBatchesCreated} validation batches are active and ${validationBatchesDeferred} are deferred`); }
    else { finalStatus = 'COMPLETED'; }
    // If this is an extraction batch that has spawned validation sub-batches or deferred items, null out jobId
    // so we don't re-process the same Gemini SUCCEEDED batch again on the next cron iteration.
    const updateData: any = { status: finalStatus, errorMessage: errorCount > 0 ? `${errorCount} items failed processing. Examples: ${errorDetails.slice(0, 5).join("; ")}` : null };
    if (!isValidationResults && finalStatus === 'PROCESSING') { updateData.jobId = null; }
  await prisma.aIBatch.update({ where: { id: batch.id }, data: updateData });

    const shouldNotifyFailure = (finalStatus === 'FAILED');
    const finalOps: BatchOperations = { batchItemUpdates: [], pendingInvoiceDeletions: (validationQueue.length === 0 && validationBatchesDeferred === 0) ? [`batchId:${batch.id}`] : [], notifications: shouldNotifyFailure ? [{ userId: batch.admin.id, message: `El procesamiento por lotes ha fallado completamente - ningún elemento pudo procesarse exitosamente.`, type: 'INVOICE_PROCESSING_FAILED', relatedId: batch.id }] : [], deferredValidations: [] };
    if (finalOps.notifications.length > 0 || finalOps.pendingInvoiceDeletions.length > 0) {
      try {
        if (finalOps.pendingInvoiceDeletions.length > 0 && finalOps.pendingInvoiceDeletions[0].startsWith('batchId:')) {
          await prisma.pendingBatchInvoice.deleteMany({ where: { batchId: batch.id } });
          finalOps.pendingInvoiceDeletions = [];
        }
        await executeBatchOperations(finalOps);
      } catch {}
    }

    if (validationQueue.length > 0 || validationBatchesDeferred > 0) { console.log(`[Batch ${batch.id}] Keeping PendingBatchInvoice records until validation completes (${validationQueue.length} items in original queue, ${validationBatchesDeferred} batches deferred)`); }
    // If we processed validation results, see if parent extraction batches can be marked COMPLETED now
    if (isValidationResults && parentBatchIds.size > 0) {
      for (const parentId of parentBatchIds) {
        try {
          const remaining = await prisma.batchItem.count({ where: { batchId: parentId, OR: [ { processed: false }, { extractedInvoiceData: { not: Prisma.DbNull } } ] } });
          if (remaining === 0) {
            await prisma.aIBatch.update({ where: { id: parentId }, data: { status: 'COMPLETED' } });
            console.log(`[Batch ${batch.id}] Marked parent extraction batch ${parentId} as COMPLETED`);
          } else {
            console.log(`[Batch ${batch.id}] Parent extraction batch ${parentId} still has ${remaining} pending items`);
          }
        } catch (e) {
          console.warn(`[Batch ${batch.id}] Failed to update parent batch ${parentId}:`, e);
        }
      }
    }

    console.log(`[Batch ${batch.id}] Completed processing. Success: ${successCount}, Errors: ${errorCount}, Final status: ${finalStatus}`);
  } catch (error) {
    console.error(`[Batch ${batch.id}] Error processing batch results:`, error);
    await prisma.aIBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message : 'Error processing results' } });
    await prisma.batchItem.updateMany({ where: { batchId: batch.id, processed: false }, data: { processed: true, processedAt: new Date(), errorMessage: 'Batch results processing failed' } });

    // Check if this is a validation batch and update parent extraction batches
    if (batch.purpose === 'VALIDATION') {
      const pdfUrls = await prisma.batchItem.findMany({
        where: { batchId: batch.id },
        select: { pdfUrl: true }
      });
      if (pdfUrls.length > 0) {
        // Import the helper function (we need to move it to a shared location or import it)
        // For now, let's inline the logic here to avoid circular imports
        try {
          const originalBatchItems = await prisma.batchItem.findMany({
            where: {
              pdfUrl: { in: pdfUrls.map(p => p.pdfUrl) },
              batch: {
                purpose: 'EXTRACTION',
                adminId: batch.admin.id
              }
            },
            select: {
              id: true,
              batchId: true,
              pdfUrl: true
            }
          });

          if (originalBatchItems.length > 0) {
            const extractionBatchIds = [...new Set(originalBatchItems.map(item => item.batchId))];

            for (const batchId of extractionBatchIds) {
              try {
                const remainingValidationBatches = await prisma.aIBatch.findMany({
                  where: {
                    purpose: 'VALIDATION',
                    adminId: batch.admin.id,
                    status: { in: ['SUBMITTED', 'PROCESSING'] },
                    batchItems: {
                      some: {
                        pdfUrl: { in: originalBatchItems.filter(item => item.batchId === batchId).map(item => item.pdfUrl) }
                      }
                    }
                  },
                  select: { id: true, status: true }
                });

                if (remainingValidationBatches.length === 0) {
                  const extractionBatch = await prisma.aIBatch.findUnique({
                    where: { id: batchId },
                    select: { id: true, status: true }
                  });

                  if (extractionBatch && extractionBatch.status === 'PROCESSING') {
                    await prisma.aIBatch.update({
                      where: { id: batchId },
                      data: { status: 'FAILED', errorMessage: 'All validation batches failed' }
                    });
                    console.log(`[Parent Update] Marked extraction batch ${batchId} as FAILED - all validation batches completed/failed`);
                  }
                }
              } catch (batchError) {
                console.error(`[Parent Update] Error checking extraction batch ${batchId}:`, batchError);
              }
            }
          }
        } catch (parentUpdateError) {
          console.error('[Parent Update] Error updating parent extraction batches:', parentUpdateError);
        }
      }
    }
  }
}
