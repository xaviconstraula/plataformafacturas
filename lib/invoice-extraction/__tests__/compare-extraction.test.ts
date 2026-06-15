import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    compareStoredVsExtracted,
    normalizeWorkOrderForComparison,
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

    it('treats equivalent work order formats as match', () => {
        const stored = buildStored({
            items: [{
                id: 'item-1',
                description: null,
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100,
                workOrder: '4078',
                discountPercentage: 0,
                lineNumber: 1,
                material: { name: 'TERMO ELECTRICO GZT 500L', code: 'TERM001' },
            }],
        });
        const extracted = buildExtracted({
            items: [{
                materialName: 'TERMO ELECTRICO GZT 500L',
                materialCode: 'TERM001',
                isMaterial: true,
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100,
                workOrder: 'OT-4078',
                discountPercentage: 0,
                lineNumber: 1,
            }],
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'match');
        assert.equal(normalizeWorkOrderForComparison('4078'), '4078');
        assert.equal(normalizeWorkOrderForComparison('OT-4078'), '4078');
        assert.equal(normalizeWorkOrderForComparison('OT4078'), '4078');
    });

    it('compares product name from material.name, not line description notes', () => {
        const stored = buildStored({
            items: [{
                id: 'item-1',
                description: 'AVISAR 1 DIA ANTES',
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100,
                workOrder: '4078',
                discountPercentage: 0,
                lineNumber: 1,
                material: { name: 'TERMO ELECTRICO GZT 500L', code: 'TERM001' },
            }],
        });
        const extracted = buildExtracted({
            items: [{
                materialName: 'TERMO ELECTRICO GZT 500L',
                materialCode: 'TERM001',
                isMaterial: true,
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100,
                workOrder: '4078',
                discountPercentage: 0,
                lineNumber: 1,
            }],
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'minor_diff');
        assert.ok(result.lineDiffs?.[0].fields.some((field) => field.field === 'lineNote' && field.severity === 'minor'));
        assert.ok(!result.lineDiffs?.[0].fields.some((field) => field.field === 'materialName'));
    });

    it('matches repositioned lines by content instead of reporting missing and extra', () => {
        const stored = buildStored({
            items: [
                {
                    id: 'item-1',
                    description: null,
                    quantity: 1,
                    unitPrice: 50,
                    totalPrice: 50,
                    workOrder: null,
                    discountPercentage: 0,
                    lineNumber: 1,
                    material: { name: 'PRODUCTO PRINCIPAL', code: 'P001' },
                },
                {
                    id: 'item-2',
                    description: null,
                    quantity: 1,
                    unitPrice: 2.5,
                    totalPrice: 2.5,
                    workOrder: null,
                    discountPercentage: 0,
                    lineNumber: 8,
                    material: { name: 'ECOTASA DE RESIDUOS DE APARATO', code: 'ECO001' },
                },
            ],
        });
        const extracted = buildExtracted({
            items: [
                {
                    materialName: 'PRODUCTO PRINCIPAL',
                    materialCode: 'P001',
                    isMaterial: true,
                    quantity: 1,
                    unitPrice: 50,
                    totalPrice: 50,
                    lineNumber: 1,
                },
                {
                    materialName: 'ECOTASA DE RESIDUOS DE APARATO',
                    materialCode: 'ECO001',
                    isMaterial: true,
                    quantity: 1,
                    unitPrice: 2.5,
                    totalPrice: 2.5,
                    lineNumber: 2,
                },
            ],
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'minor_diff');
        assert.ok(!result.lineDiffs?.some((line) => line.matchKind === 'missing'));
        assert.ok(!result.lineDiffs?.some((line) => line.matchKind === 'extra'));
        assert.ok(result.lineDiffs?.some((line) => line.matchKind === 'content' && line.fields.some((field) => field.field === 'lineNumber' && field.severity === 'minor')));
    });

    it('treats work order-only differences as minor', () => {
        const stored = buildStored({
            items: [{
                id: 'item-1',
                description: null,
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100,
                workOrder: '4078',
                discountPercentage: 0,
                lineNumber: 1,
                material: { name: 'TERMO ELECTRICO GZT 500L', code: 'TERM001' },
            }],
        });
        const extracted = buildExtracted({
            items: [{
                materialName: 'TERMO ELECTRICO GZT 500L',
                materialCode: 'TERM001',
                isMaterial: true,
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100,
                workOrder: 'OT-9999',
                discountPercentage: 0,
                lineNumber: 1,
            }],
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'minor_diff');
        assert.ok(result.lineDiffs?.[0].fields.some((field) => field.field === 'workOrder' && field.severity === 'minor'));
    });
});

describe('summarizeBatchReanalysisReport', () => {
    it('counts statuses correctly', () => {
        const summary = summarizeBatchReanalysisReport([
            { fileName: 'a.pdf', r2Key: 'batch/a.pdf', invoiceCode: 'A', status: 'match' },
            { fileName: 'b.pdf', r2Key: 'batch/b.pdf', invoiceCode: 'B', status: 'diff' },
            { fileName: 'e.pdf', r2Key: 'batch/e.pdf', invoiceCode: 'E', status: 'minor_diff' },
            { fileName: 'c.pdf', r2Key: 'batch/c.pdf', invoiceCode: 'C', status: 'not_found' },
            { fileName: 'd.pdf', r2Key: 'batch/d.pdf', invoiceCode: 'D', status: 'extraction_error', error: 'fail' },
        ]);

        assert.equal(summary.matchedCount, 1);
        assert.equal(summary.diffCount, 1);
        assert.equal(summary.minorDiffCount, 1);
        assert.equal(summary.notFoundCount, 1);
        assert.equal(summary.errorCount, 1);
    });
});
