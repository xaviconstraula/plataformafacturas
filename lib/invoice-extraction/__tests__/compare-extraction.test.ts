import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    compareStoredVsExtracted,
    summarizeBatchReanalysisReport,
    type StoredInvoiceForComparison,
} from '@/lib/invoice-extraction/compare-extraction';
import type { ExtractedPdfData } from '@/lib/types/pdf';

function buildStored(overrides?: Partial<StoredInvoiceForComparison>): StoredInvoiceForComparison {
    return {
        id: 'inv-1',
        invoiceCode: 'FAC-001',
        issueDate: new Date('2024-06-15'),
        totalAmount: 121,
        ivaPercentage: 21,
        retentionAmount: 0,
        provider: { name: 'Proveedor SA', cif: 'ESB12345678' },
        items: [{
            id: 'item-1',
            description: 'Cemento Portland',
            quantity: 10,
            unitPrice: 10,
            totalPrice: 100,
            workOrder: 'OT-100',
            discountPercentage: 0,
            lineNumber: 1,
            material: { name: 'Cemento Portland', code: 'CEM001' },
        }],
        ...overrides,
    };
}

function buildExtracted(overrides?: Partial<ExtractedPdfData>): ExtractedPdfData {
    return {
        invoiceCode: 'FAC-001',
        issueDate: '2024-06-15',
        totalAmount: 121,
        ivaPercentage: 21,
        retentionAmount: 0,
        provider: { name: 'Proveedor SA', cif: 'ESB12345678' },
        items: [{
            materialName: 'Cemento Portland',
            materialCode: 'CEM001',
            isMaterial: true,
            quantity: 10,
            unitPrice: 10,
            totalPrice: 100,
            workOrder: 'OT-100',
            discountPercentage: 0,
            lineNumber: 1,
        }],
        ...overrides,
    };
}

describe('compareStoredVsExtracted', () => {
    it('returns match when stored and rescanned data are equivalent', () => {
        const result = compareStoredVsExtracted(buildStored(), buildExtracted());
        assert.equal(result.status, 'match');
        assert.equal(result.invoiceLevelDiffs, undefined);
        assert.equal(result.lineDiffs, undefined);
    });

    it('detects line-level materialName differences', () => {
        const extracted = buildExtracted({
            items: [{
                materialName: 'PACK 6 UDS SILICONA',
                materialCode: '9900',
                isMaterial: true,
                quantity: 10,
                unitPrice: 10,
                totalPrice: 100,
                lineNumber: 1,
            }],
        });

        const result = compareStoredVsExtracted(buildStored(), extracted);

        assert.equal(result.status, 'diff');
        assert.ok(result.lineDiffs && result.lineDiffs.length === 1);
        assert.ok(result.lineDiffs[0].fields.some((field) => field.field === 'materialName'));
    });

    it('detects line count mismatch', () => {
        const result = compareStoredVsExtracted(
            buildStored(),
            buildExtracted({ items: [] }),
        );

        assert.equal(result.status, 'diff');
        assert.ok(result.invoiceLevelDiffs?.some((field) => field.field === 'lineCount'));
    });

    it('treats equivalent CIF formats as match', () => {
        const stored = buildStored({
            provider: { name: 'Proveedor SA', cif: 'ESB12345678' },
        });
        const extracted = buildExtracted({
            provider: { name: 'Proveedor SA', cif: 'B-12345678' },
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'match');
    });

    it('treats names with extra whitespace as match', () => {
        const stored = buildStored({
            items: [{
                id: 'item-1',
                description: 'Cemento Portland',
                quantity: 10,
                unitPrice: 10,
                totalPrice: 100,
                workOrder: 'OT-100',
                discountPercentage: 0,
                lineNumber: 1,
                material: { name: 'Cemento Portland', code: 'CEM001' },
            }],
        });
        const extracted = buildExtracted({
            items: [{
                materialName: '  Cemento   Portland ',
                materialCode: 'CEM001',
                isMaterial: true,
                quantity: 10,
                unitPrice: 10,
                totalPrice: 100,
                workOrder: 'OT-100',
                discountPercentage: 0,
                lineNumber: 1,
            }],
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'match');
    });
});

describe('summarizeBatchReanalysisReport', () => {
    it('counts statuses correctly', () => {
        const summary = summarizeBatchReanalysisReport([
            { fileName: 'a.pdf', r2Key: 'batch/a.pdf', invoiceCode: 'A', status: 'match' },
            { fileName: 'b.pdf', r2Key: 'batch/b.pdf', invoiceCode: 'B', status: 'diff' },
            { fileName: 'c.pdf', r2Key: 'batch/c.pdf', invoiceCode: 'C', status: 'not_found' },
            { fileName: 'd.pdf', r2Key: 'batch/d.pdf', invoiceCode: 'D', status: 'extraction_error', error: 'fail' },
        ]);

        assert.equal(summary.matchedCount, 1);
        assert.equal(summary.diffCount, 1);
        assert.equal(summary.notFoundCount, 1);
        assert.equal(summary.errorCount, 1);
    });
});
