import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiJsonExtraction, mergeExtractedItems } from '@/lib/invoice-extraction/parse-json';
import { validateExtractedItems, looksLikePrice } from '@/lib/invoice-extraction/validate-items';

describe('parseGeminiJsonExtraction', () => {
    it('parses a valid invoice with pipe in description', () => {
        const payload = {
            invoiceCode: 'FAC-2024-001',
            issueDate: '2024-12-31',
            totalAmount: 1512.55,
            ivaPercentage: 21,
            retentionAmount: 0,
            provider: {
                name: 'ACME S.L.',
                cif: 'ESB12345678',
                email: null,
                phone: null,
                address: null,
            },
            items: [
                {
                    lineNumber: 1,
                    materialName: 'PACK 6 UDS SILICONA',
                    materialCode: '9900',
                    isMaterial: true,
                    quantity: 1,
                    discountRaw: '0',
                    unitPrice: 0,
                    totalPrice: 0,
                    itemDate: null,
                    workOrder: null,
                    description: 'Extra | with pipe',
                },
                {
                    lineNumber: 2,
                    materialName: 'PATTEX SILICON 5',
                    materialCode: '2182',
                    isMaterial: true,
                    quantity: 6,
                    discountRaw: '0',
                    unitPrice: 3,
                    totalPrice: 18,
                },
            ],
        };

        const result = parseGeminiJsonExtraction(JSON.stringify(payload));
        assert.ok(result.data);
        assert.equal(result.data!.items.length, 2);
        assert.equal(result.data!.items[0].materialName, 'PACK 6 UDS SILICONA');
        assert.equal(result.data!.items[0].description, 'Extra | with pipe');
        assert.equal(result.data!.items[1].totalPrice, 18);
    });

    it('rejects materialName that looks like a price', () => {
        const payload = {
            invoiceCode: 'X',
            issueDate: '2024-01-15',
            totalAmount: 10,
            ivaPercentage: 21,
            retentionAmount: 0,
            provider: { name: 'P', cif: 'ESB12345678' },
            items: [
                {
                    materialName: '25.50',
                    materialCode: null,
                    isMaterial: true,
                    quantity: 1,
                    unitPrice: 25.5,
                    totalPrice: 25.5,
                },
            ],
        };

        const result = parseGeminiJsonExtraction(JSON.stringify(payload));
        assert.equal(result.data, null);
        assert.ok(result.validationIssues && result.validationIssues.length > 0);
    });

    it('merges follow-up items by lineNumber', () => {
        const base = parseGeminiJsonExtraction(
            JSON.stringify({
                invoiceCode: 'A',
                issueDate: '2024-01-01',
                totalAmount: 100,
                ivaPercentage: 21,
                retentionAmount: 0,
                provider: { name: 'P', cif: 'ESB12345678' },
                items: [
                    {
                        lineNumber: 1,
                        materialName: 'Item one',
                        isMaterial: true,
                        quantity: 1,
                        unitPrice: 10,
                        totalPrice: 10,
                    },
                ],
            }),
        ).data!;

        const merged = mergeExtractedItems(base, [
            {
                materialName: 'Item two',
                isMaterial: true,
                quantity: 2,
                unitPrice: 5,
                totalPrice: 10,
                lineNumber: 2,
            },
        ]);

        assert.equal(merged.items.length, 2);
        assert.equal(merged.items[1].materialName, 'Item two');
    });
});

describe('validateExtractedItems', () => {
    it('looksLikePrice detects numeric amounts', () => {
        assert.equal(looksLikePrice('18.00'), true);
        assert.equal(looksLikePrice('CEMENTO PORTLAND'), false);
    });
});
