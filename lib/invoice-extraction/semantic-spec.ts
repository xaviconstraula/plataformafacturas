/** Shared semantic extraction rules for prompts and schema descriptions. */

export const SEMANTIC_EXTRACTION_SPEC = `
SEMANTIC FIELD DEFINITIONS (apply consistently on every invoice):

HEADER:
• invoiceCode — Invoice number only (NOT order, delivery note, or quote). Source: "Factura nº", "Nº Factura".
• issueDate — Issue/emission date. Convert DD/MM/YYYY → YYYY-MM-DD. Never YYYY-DD-MM.
• totalAmount — Total amount to pay WITH IVA included. Source: "Total factura", "Total". Number with dot decimal.
• ivaPercentage — Primary VAT rate (21.00, 10.00, 4.00, 0.00). Default 21.00 if unclear.
• retentionAmount — IRPF withholding in euros (not %). Default 0.00 if none.

PROVIDER:
• provider.name — Legal/trade name of the issuer (header block).
• provider.cif — VAT ID with country prefix, no spaces: ESB12345678 for Spanish B12345678.
• provider.email, phone, address — optional; null if not visible.

LINE ITEMS (one JSON object per product/service row, in exact visual order):
• lineNumber — 1-based sequence matching row order on the invoice (1, 2, 3…).
• materialCode — Product reference from CÓDIGO / REF / ARTÍCULO column only. null if absent.
• materialName — Human-readable concept from CONCEPTO / DESCRIPCIÓN column only. NEVER a price or amount.
• isMaterial — true for products, false for services.
• quantity — Units from CANT / Uds column. 0 if blank.
• discountRaw — Discount as printed: "0", "10", "50 5", "NETO". "0" if blank.
• unitPrice — Unit price of THIS row from PRECIO UNITARIO. 0.00 if cell is blank.
• totalPrice — Line total of THIS row from IMPORTE / TOTAL. 0.00 if cell is blank.
• itemDate — YYYY-MM-DD only if line date differs from invoice date; else null.
• workOrder — OT/CECO from section header (e.g. "S/REF: 074129/001941" → "074129"). Inherit until next section.
• description — Extra detail beyond materialName on same row; null if redundant.

SPANISH INVOICE COLUMN MAPPING (CRITICAL):
• materialCode ← CÓDIGO / REF / ARTÍCULO column only.
• materialName ← CONCEPTO / DESCRIPCIÓN column only.
• NEVER put prices (25.50, 18.00) in materialName.
• NEVER put product codes in materialName when CONCEPTO text exists in the same row.

ROW INDEPENDENCE (most common extraction error):
• Each table row is 100% independent. Blank prices on row 1 → unitPrice 0, totalPrice 0.
• NEVER borrow prices from adjacent rows to "fill in" missing values.
• PACK/KIT lines (e.g. "PACK 6 UDS", "KIT G FIJACION") often have no prices → quantity as shown, prices 0.

ORDER:
• items[] MUST follow exact visual order on the invoice. Do NOT reorder, sort, or group by code/price.

WORK ORDERS:
• Section headers like "S/REF: 074129/001941" → extract OT "074129" and apply to all following items until a new section.

SKIP (not line items):
• Loyalty points, promotions, subtotal headers without products, asterisk dividers, metadata rows.

CREDIT NOTES:
• Labels: "DEVOLUCIÓN", "ABONO", "NOTA DE CRÉDITO". Preserve negative signs (74,40- → -74.40).

CONSISTENCY:
• Always extract the same semantic fields with the same formats across all invoices.
• Numbers: dot decimal (1234.56), no thousand separators.
• Empty optional strings → null. Missing discounts → "0". Missing retention → 0.00.

PRE-RESPONSE CHECKLIST:
✓ CIF has ES prefix, no spaces
✓ Dates are YYYY-MM-DD
✓ materialName is never a price or bare code when concept text exists
✓ Each row uses only its own prices
✓ items[] order matches the PDF exactly
`;

export const JSON_OUTPUT_EXAMPLE = `
EXAMPLE OUTPUT (structure and semantics):
{
  "invoiceCode": "FAC-2024-001",
  "issueDate": "2024-12-31",
  "totalAmount": 1512.55,
  "ivaPercentage": 21.00,
  "retentionAmount": 0.00,
  "provider": {
    "name": "ACME SUMINISTROS S.L.",
    "cif": "ESB12345678",
    "email": null,
    "phone": null,
    "address": null
  },
  "items": [
    {
      "lineNumber": 1,
      "materialName": "PACK 6 UDS SILICONA FUNGICIDA BLANCA",
      "materialCode": "9900",
      "isMaterial": true,
      "quantity": 1.00,
      "discountRaw": "0",
      "unitPrice": 0.00,
      "totalPrice": 0.00,
      "itemDate": null,
      "workOrder": "074129",
      "description": null
    },
    {
      "lineNumber": 2,
      "materialName": "PATTEX SILICON 5 SILICONA",
      "materialCode": "2182",
      "isMaterial": true,
      "quantity": 6.00,
      "discountRaw": "0",
      "unitPrice": 3.00,
      "totalPrice": 18.00,
      "itemDate": null,
      "workOrder": "074129",
      "description": null
    },
    {
      "lineNumber": 3,
      "materialName": "MASCARILLA STEELPRO FFP2",
      "materialCode": "2801",
      "isMaterial": true,
      "quantity": 12.00,
      "discountRaw": "50 5",
      "unitPrice": 0.56,
      "totalPrice": 6.66,
      "itemDate": null,
      "workOrder": "074129",
      "description": null
    }
  ]
}
`;
