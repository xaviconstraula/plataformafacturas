"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
// Same parseJsonSafe function from invoices.ts
function parseJsonSafe(rawInput) {
    if (!rawInput)
        return null;
    let raw = rawInput.trim();
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
    }
    raw = raw.replace(/[\uFEFF\u200B-\u200D]/g, '');
    if (raw.startsWith('{\\')) {
        raw = raw
            .replace(/\\\\/g, '\x00')
            .replace(/\\"/g, '"')
            .replace(/\\\//g, '/')
            .replace(/\\b/g, '\b')
            .replace(/\\f/g, '\f')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\x00/g, '\\');
    }
    raw = raw.replace(/(\d+),(\d+)/g, '$1.$2');
    raw = raw.replace(/,\s*([}\]])/g, '$1');
    try {
        return JSON.parse(raw);
    }
    catch (e) {
        console.error('[parseJsonSafe] JSON.parse failed:', e.message);
    }
    try {
        if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
            const onceDecoded = JSON.parse(raw);
            try {
                return JSON.parse(onceDecoded);
            }
            catch {
                return onceDecoded;
            }
        }
    }
    catch { }
    try {
        const quoted = '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        const decoded = JSON.parse(quoted);
        return JSON.parse(decoded);
    }
    catch { }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        const slice = raw.slice(start, end + 1);
        try {
            return JSON.parse(slice);
        }
        catch { }
    }
    return null;
}
function isExtractedPdfData(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    const provider = v.provider;
    const items = v.items;
    return typeof v.invoiceCode === 'string'
        && provider !== undefined
        && typeof provider.name === 'string'
        && typeof v.issueDate === 'string'
        && typeof v.totalAmount === 'number'
        && Array.isArray(items);
}
// Test the parsing logic
async function testBatchFileParsing() {
    const batchDir = path.join(process.cwd(), 'tmp', 'facturas-batch');
    if (!fs.existsSync(batchDir)) {
        console.error(`Batch directory not found: ${batchDir}`);
        return;
    }
    const files = fs.readdirSync(batchDir).filter(f => f.startsWith('batch-'));
    console.log(`Found ${files.length} batch files to test\n`);
    for (const file of files) {
        const filePath = path.join(batchDir, file);
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Testing file: ${file}`);
        console.log(`${'='.repeat(80)}\n`);
        await testFile(filePath);
    }
}
async function testFile(filePath) {
    const results = [];
    let lineNumber = 0;
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        lineNumber++;
        if (!line.trim()) {
            continue;
        }
        try {
            const rootObj = JSON.parse(line);
            const key = rootObj.key ?? rootObj.custom_id;
            let extractedContent;
            let extractedData;
            // Handle the Gemini batch response format
            if (rootObj.response) {
                const response = rootObj.response;
                const candidates = response.candidates;
                if (candidates && candidates.length > 0) {
                    const candidate = candidates[0];
                    const content = candidate.content;
                    const parts = content?.parts;
                    if (parts && parts.length > 0) {
                        extractedContent = parts
                            .map((p) => {
                            const textContent = p?.text;
                            return typeof textContent === 'string' ? textContent : '';
                        })
                            .join('');
                    }
                }
            }
            if (extractedContent) {
                const parsed = parseJsonSafe(extractedContent);
                if (isExtractedPdfData(parsed)) {
                    extractedData = parsed;
                    results.push({
                        success: true,
                        line: lineNumber,
                        key,
                        extracted: extractedData,
                    });
                }
                else {
                    const preview = extractedContent.substring(0, 150);
                    results.push({
                        success: false,
                        line: lineNumber,
                        key,
                        error: 'Parsed JSON does not match ExtractedPdfData schema',
                        content: preview,
                    });
                }
            }
            else {
                results.push({
                    success: false,
                    line: lineNumber,
                    key,
                    error: 'Could not extract content from response',
                });
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            results.push({
                success: false,
                line: lineNumber,
                error: `Root JSON parse error: ${errorMsg}`,
            });
        }
    }
    // Print results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    console.log(`\n📊 Results Summary:`);
    console.log(`   Total lines processed: ${results.length}`);
    console.log(`   ✅ Successfully parsed: ${successful.length}`);
    console.log(`   ❌ Failed to parse: ${failed.length}`);
    if (failed.length > 0) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log('❌ Failed Parsing Details:');
        console.log(`${'─'.repeat(80)}`);
        failed.slice(0, 5).forEach((result) => {
            console.log(`\nLine ${result.line}${result.key ? ` (${result.key})` : ''}:`);
            console.log(`  Error: ${result.error}`);
            if (result.content) {
                console.log(`  Content preview: ${result.content}`);
            }
        });
        if (failed.length > 5) {
            console.log(`\n... and ${failed.length - 5} more failures`);
        }
    }
    if (successful.length > 0) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log('✅ Sample of Successfully Parsed Invoices:');
        console.log(`${'─'.repeat(80)}`);
        successful.slice(0, 3).forEach((result) => {
            const inv = result.extracted;
            if (inv) {
                console.log(`\nLine ${result.line}: ${inv.invoiceCode}`);
                console.log(`  Provider: ${inv.provider.name} (CIF: ${inv.provider.cif})`);
                console.log(`  Items: ${inv.items.length}`);
                console.log(`  Total: €${inv.totalAmount.toFixed(2)}`);
            }
        });
    }
}
// Run the test
testBatchFileParsing().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
