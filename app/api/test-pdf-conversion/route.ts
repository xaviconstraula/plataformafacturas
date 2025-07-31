import { NextRequest, NextResponse } from 'next/server'
import { pdfToPng } from 'pdf-to-png-converter'

interface ConvertedPage {
    pageNumber: number
    imageUrl: string
    width: number
    height: number
}

interface ConversionResult {
    success: boolean
    pages?: ConvertedPage[]
    error?: string
    fileName?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<ConversionResult>> {
    try {
        const formData = await request.formData()
        const file = formData.get('pdf') as File

        if (!file) {
            return NextResponse.json({
                success: false,
                error: 'No PDF file provided'
            })
        }

        if (file.type !== 'application/pdf') {
            return NextResponse.json({
                success: false,
                error: 'File must be a PDF'
            })
        }

        if (file.size === 0) {
            return NextResponse.json({
                success: false,
                error: 'File is empty'
            })
        }

        console.log(`Converting PDF to images: ${file.name} (${file.size} bytes)`)

        // Convert file to buffer and then to ArrayBuffer
        const buffer = Buffer.from(await file.arrayBuffer())
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

        let pages
        try {
            // Use the same conversion settings as in the invoice processing
            pages = await pdfToPng(arrayBuffer, {
                disableFontFace: true,
                useSystemFonts: false,
                viewportScale: 2.0,
                verbosityLevel: 0,
            })
        } catch (conversionError: unknown) {
            console.error(`Error during pdfToPng conversion for ${file.name}:`, conversionError)

            if (typeof conversionError === 'object' && conversionError !== null && 'code' in conversionError &&
                (conversionError as { code: unknown }).code === 'InvalidArg' &&
                'message' in conversionError && typeof (conversionError as { message: unknown }).message === 'string' &&
                (conversionError as { message: string }).message.includes('Convert String to CString failed')) {
                return NextResponse.json({
                    success: false,
                    error: `PDF conversion failed: ${file.name} could not be converted due to internal font/text encoding issues. Details: ${(conversionError as { message: string }).message}`
                })
            }

            return NextResponse.json({
                success: false,
                error: `PDF conversion failed: ${conversionError instanceof Error ? conversionError.message : 'Unknown conversion error'}`
            })
        }

        if (!pages || pages.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Failed to convert PDF to images - no pages generated'
            })
        }

        console.log(`Successfully converted ${pages.length} pages from ${file.name}`)

        // Convert pages to the format expected by the frontend
        const convertedPages: ConvertedPage[] = pages
            .map((page, index) => {
                if (!page?.content) {
                    console.warn(`Skipping page ${index + 1} in ${file.name} due to missing content`)
                    return null
                }

                return {
                    pageNumber: index + 1,
                    imageUrl: `data:image/png;base64,${page.content.toString('base64')}`,
                    width: page.width || 0,
                    height: page.height || 0
                }
            })
            .filter((page): page is ConvertedPage => page !== null)

        if (convertedPages.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No valid page images could be generated'
            })
        }

        return NextResponse.json({
            success: true,
            pages: convertedPages,
            fileName: file.name
        })

    } catch (error) {
        console.error('Error in PDF conversion API:', error)

        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown server error'
        })
    }
} 