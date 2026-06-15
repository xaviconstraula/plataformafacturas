import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    canonicalizeLineNote,
    canonicalizeWorkOrder,
    normalizeLineNoteForComparison,
    workOrdersEquivalent,
} from '@/lib/invoice-extraction/normalize-line-context';
import {
    compareStoredVsExtracted,
    type StoredInvoiceForComparison,
} from '@/lib/invoice-extraction/compare-extraction';
import type { ExtractedPdfData } from '@/lib/types/pdf';

describe('normalizeLineNoteForComparison', () => {
    it('ignores ALBARAN header prefixes in line notes', () => {
        const stored = 'S/REF:LLAVE STILSON OBRA: CONSTRAULA SAU (OT.4035)';
        const rescanned = 'ALBARAN Nº 690.310 S/REF:LLAVE STILSON OBRA: CONSTRAULA SAU (OT.4035)';

        assert.equal(
            normalizeLineNoteForComparison(stored),
            normalizeLineNoteForComparison(rescanned),
        );
    });

    it('strips ALBARAN boilerplate when canonicalizing', () => {
        assert.equal(
            canonicalizeLineNote('ALBARAN Nº 690.310 S/REF:LLAVE STILSON'),
            'S/REF:LLAVE STILSON',
        );
    });
});

describe('workOrdersEquivalent', () => {
    it('treats concatenated refs and short refs as equivalent', () => {
        assert.equal(workOrdersEquivalent('OT-996754095129', 'OT-99675'), true);
        assert.equal(workOrdersEquivalent('99675-OT4095-129', '4095'), true);
        assert.equal(workOrdersEquivalent('4078', 'OT-4078'), true);
    });

    it('canonicalizes SALTOKI S/REF format to OT digits', () => {
        assert.equal(canonicalizeWorkOrder('99675-OT4095-129'), '4095');
    });
});

describe('compareStoredVsExtracted contextual consistency', () => {
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
                description: 'S/REF:LLAVE STILSON OBRA: CONSTRAULA SAU (OT.4035)',
                quantity: 1,
                unitPrice: 10,
                totalPrice: 10,
                workOrder: null,
                discountPercentage: 0,
                lineNumber: 1,
                material: { name: 'LLAVE ALUMINIO 10 BULTMEIER', code: 'LL001' },
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
                materialName: 'LLAVE ALUMINIO 10 BULTMEIER',
                materialCode: 'LL001',
                isMaterial: true,
                quantity: 1,
                unitPrice: 10,
                totalPrice: 10,
                description: 'ALBARAN Nº 690.310 S/REF:LLAVE STILSON OBRA: CONSTRAULA SAU (OT.4035)',
                lineNumber: 1,
            }],
            ...overrides,
        };
    }

    it('matches line notes when only ALBARAN header differs', () => {
        const result = compareStoredVsExtracted(buildStored(), buildExtracted());
        assert.equal(result.status, 'match');
    });

    it('matches SALTOKI work orders with different ref encodings', () => {
        const stored = buildStored({
            items: [{
                id: 'item-1',
                description: null,
                quantity: 2,
                unitPrice: 10,
                totalPrice: 20,
                workOrder: 'OT-996754095129',
                discountPercentage: 0,
                lineNumber: 1,
                material: { name: 'TUBO EVACUACION 1M Ø125 PVC SERIE B', code: '1900010112' },
            }],
        });
        const extracted = buildExtracted({
            items: [{
                materialName: 'TUBO EVACUACION 1M Ø125 PVC SERIE B',
                materialCode: '1900010112',
                isMaterial: true,
                quantity: 2,
                unitPrice: 10,
                totalPrice: 20,
                workOrder: '99675',
                lineNumber: 1,
            }],
        });

        const result = compareStoredVsExtracted(stored, extracted);
        assert.equal(result.status, 'match');
    });
});
