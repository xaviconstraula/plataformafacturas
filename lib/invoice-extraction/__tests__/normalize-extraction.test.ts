import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    canonicalizeProviderCif,
    normalizeComparableText,
    normalizeExtractedInvoice,
} from '@/lib/invoice-extraction/normalize-extraction';
import type { ExtractedPdfData } from '@/lib/types/pdf';

function buildExtracted(overrides?: Partial<ExtractedPdfData>): ExtractedPdfData {
    return {
        invoiceCode: ' FAC-001 ',
        issueDate: '2024-06-15',
        totalAmount: 121.005,
        ivaPercentage: 21,
        retentionAmount: 0,
        provider: {
            name: '  Proveedor   SA  ',
            cif: 'B-12345678',
        },
        items: [{
            materialName: '  Cemento   Portland ',
            materialCode: 'cem-001',
            isMaterial: true,
            quantity: 10.0004,
            unitPrice: 10.0006,
            totalPrice: 100.0008,
            lineNumber: 1,
        }],
        ...overrides,
    };
}

describe('canonicalizeProviderCif', () => {
    it('normalizes Spanish CIF with separators to ES prefix', () => {
        assert.equal(canonicalizeProviderCif('B-12345678'), 'ESB12345678');
        assert.equal(canonicalizeProviderCif('ES B12345678'), 'ESB12345678');
    });
});

describe('normalizeComparableText', () => {
    it('collapses repeated whitespace', () => {
        assert.equal(normalizeComparableText('  foo   bar  '), 'foo bar');
    });
});

describe('normalizeExtractedInvoice', () => {
    it('normalizes header, provider, and line items consistently', () => {
        const normalized = normalizeExtractedInvoice(buildExtracted());

        assert.equal(normalized.invoiceCode, 'FAC-001');
        assert.equal(normalized.provider.name, 'Proveedor SA');
        assert.equal(normalized.provider.cif, 'ESB12345678');
        assert.equal(normalized.totalAmount, 121);
        assert.equal(normalized.items[0].materialName, 'Cemento Portland');
        assert.equal(normalized.items[0].materialCode, 'CEM001');
        assert.equal(normalized.items[0].quantity, 10);
        assert.equal(normalized.items[0].unitPrice, 10.001);
        assert.equal(normalized.items[0].totalPrice, 100.001);
    });
});
