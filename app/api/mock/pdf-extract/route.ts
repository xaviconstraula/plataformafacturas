import { NextResponse } from "next/server"
import { pdfToPng } from "pdf-to-png-converter"
import OpenAI from "openai"

// Ensure we have the OpenAI API key
const openaiApiKey = process.env.OPENAI_API_KEY

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY environment variable")
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Convert the File to ArrayBuffer
    const buffer = Buffer.from(await file.arrayBuffer())
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

    // Convert PDF to PNG
    const [page] = await pdfToPng(arrayBuffer, {
      disableFontFace: false, // Enable better font rendering
      useSystemFonts: true,   // Allow system font fallback
      viewportScale: 2.0,     // Higher quality for better OCR
      verbosityLevel: 0,      // Only show errors
      pagesToProcess: [1],    // Only first page
      strictPagesToProcess: true, // Fail if page is invalid
    })

    if (!page?.content) {
      throw new Error("Failed to convert PDF to image")
    }

    // Convert the PNG buffer to base64
    const base64Image = `data:image/png;base64,${page.content.toString("base64")}`

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey
    })

    const prompt = 'Analyze this invoice image and extract the following information in a structured way:\n' +
      '1. Provider Information (invoice issuer):\n' +
      '   - Company name\n' +
      '   - Tax ID (CIF/NIF/DNI) following Spanish format:\n' +
      '     * CIF: Letter + 8 digits (e.g. B12345678)\n' +
      '     * NIF: 8 digits + letter (e.g. 12345678A)\n' +
      '     * DNI: 8 digits + letter (e.g. 12345678Z)\n' +
      '   - Provider contact details if available (email, phone, address)\n' +
      '2. Invoice Details:\n' +
      '   - Unique invoice code\n' +
      '   - Issue date (must be a valid date)\n' +
      '   - Total amount (must be a decimal number with 2 decimal places)\n' +
      '3. Line Items:\n' +
      '   - Material name/description\n' +
      '   - Quantity (must be a decimal number with 2 decimal places)\n' +
      '   - Unit price (must be a decimal number with 2 decimal places)\n' +
      '   - Total price per item (must be quantity * unit price)\n\n' +
      'Database Schema Requirements:\n' +
      '- Provider must have a valid tax ID (CIF/NIF/DNI) as it links to the Provider table\n' +
      '- Invoice must have a unique invoice code and valid issue date\n' +
      '- Each line item represents an InvoiceItem linked to a Material\n' +
      '- All monetary values must be Decimal(10,2)\n' +
      '- All quantities must be Decimal(10,2)\n\n' +
      'Format the response as valid JSON exactly like this:\n' +
      '{\n' +
      '  "invoiceCode": "string - unique invoice identifier",\n' +
      '  "provider": {\n' +
      '    "name": "string - company name",\n' +
      '    "cif": "string - tax ID (CIF/NIF/DNI)",\n' +
      '    "email": "string? - optional email",\n' +
      '    "phone": "string? - optional phone",\n' +
      '    "address": "string? - optional address"\n' +
      '  },\n' +
      '  "issueDate": "string - ISO date format",\n' +
      '  "totalAmount": "number - total invoice amount with 2 decimal places",\n' +
      '  "items": [\n' +
      '    {\n' +
      '      "materialName": "string - item/material name",\n' +
      '      "quantity": "number - quantity with 2 decimal places",\n' +
      '      "unitPrice": "number - price per unit with 2 decimal places",\n' +
      '      "totalPrice": "number - quantity * unitPrice with 2 decimal places"\n' +
      '    }\n' +
      '  ]\n' +
      '}'

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: base64Image,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 4096
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error("No content in OpenAI response")
    }

    // Parse the JSON response
    const extractedData = JSON.parse(content)

    return NextResponse.json(extractedData)
  } catch (error) {
    console.error("Error processing PDF:", error)
    return NextResponse.json(
      { error: "Error processing the PDF: " + (error as Error).message },
      { status: 500 }
    )
  }
}
