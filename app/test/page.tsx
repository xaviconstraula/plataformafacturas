'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

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

export default function TestPage() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isConverting, setIsConverting] = useState(false)
    const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null)

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        if (file) {
            if (file.type !== 'application/pdf') {
                toast({
                    title: "Invalid file type",
                    description: "Please select a PDF file.",
                    variant: "destructive",
                })
                return
            }
            setSelectedFile(file)
            setConversionResult(null)
        }
    }

    async function handleConvert() {
        if (!selectedFile) {
            toast({
                title: "No file selected",
                description: "Please select a PDF file first.",
                variant: "destructive",
            })
            return
        }

        setIsConverting(true)

        try {
            const formData = new FormData()
            formData.append('pdf', selectedFile)

            const response = await fetch('/api/test-pdf-conversion', {
                method: 'POST',
                body: formData,
            })

            const result: ConversionResult = await response.json()

            if (result.success) {
                setConversionResult(result)
                toast({
                    title: "Conversion successful",
                    description: `Converted ${result.pages?.length} pages from ${result.fileName}`,
                })
            } else {
                toast({
                    title: "Conversion failed",
                    description: result.error || "Unknown error occurred",
                    variant: "destructive",
                })
                setConversionResult(result)
            }
        } catch (error) {
            console.error('Error converting PDF:', error)
            toast({
                title: "Network error",
                description: "Failed to communicate with the server.",
                variant: "destructive",
            })
        } finally {
            setIsConverting(false)
        }
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="max-w-4xl mx-auto">
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>PDF to Image Converter Test</CardTitle>
                        <CardDescription>
                            Upload a PDF file to see how it gets converted to images using the same process as invoice processing.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="pdf-file">Select PDF File</Label>
                            <Input
                                id="pdf-file"
                                type="file"
                                accept=".pdf"
                                onChange={handleFileChange}
                                disabled={isConverting}
                            />
                        </div>

                        {selectedFile && (
                            <div className="p-4 bg-muted rounded-lg">
                                <p className="text-sm text-muted-foreground">
                                    Selected file: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                                </p>
                            </div>
                        )}

                        <Button
                            onClick={handleConvert}
                            disabled={!selectedFile || isConverting}
                            className="w-full"
                        >
                            {isConverting ? 'Converting...' : 'Convert PDF to Images'}
                        </Button>
                    </CardContent>
                </Card>

                {conversionResult && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Conversion Results</CardTitle>
                            <CardDescription>
                                {conversionResult.success
                                    ? `Successfully converted ${conversionResult.pages?.length} pages from ${conversionResult.fileName}`
                                    : `Failed to convert: ${conversionResult.error}`
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {conversionResult.success && conversionResult.pages ? (
                                <div className="space-y-6">
                                    {conversionResult.pages.map((page) => (
                                        <div key={page.pageNumber} className="space-y-2">
                                            <h3 className="text-lg font-semibold">
                                                Page {page.pageNumber}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Dimensions: {page.width} x {page.height}
                                            </p>
                                            <div className="border rounded-lg p-4 bg-white">
                                                <div className="relative max-w-full h-auto mx-auto shadow-lg" style={{ maxHeight: '800px' }}>
                                                    <Image
                                                        src={page.imageUrl}
                                                        alt={`Page ${page.pageNumber}`}
                                                        fill
                                                        className="object-contain"
                                                        sizes="(max-width: 768px) 100vw, 800px"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <p className="text-destructive">
                                        {conversionResult.error || 'Unknown error occurred during conversion'}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
} 