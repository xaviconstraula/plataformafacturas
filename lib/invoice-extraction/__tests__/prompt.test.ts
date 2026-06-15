import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildJsonExtractionPrompt } from '@/lib/invoice-extraction/prompt';
import { SEMANTIC_EXTRACTION_SPEC } from '@/lib/invoice-extraction/semantic-spec';

describe('buildJsonExtractionPrompt', () => {
    it('includes semantic spec and consistency instructions', () => {
        const prompt = buildJsonExtractionPrompt();

        assert.ok(prompt.includes(SEMANTIC_EXTRACTION_SPEC.slice(0, 40)));
        assert.ok(prompt.includes('PRE-RESPONSE CHECKLIST'));
        assert.ok(prompt.includes('EXAMPLE OUTPUT'));
        assert.ok(prompt.includes('Be consistent'));
        assert.ok(prompt.length > 1000);
    });
});
