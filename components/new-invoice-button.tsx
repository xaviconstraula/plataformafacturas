'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { PlusIcon } from 'lucide-react'
import { InvoiceDropzone } from '@/components/invoice-dropzone'
import { toast } from "sonner"

// TODO: Import and implement InvoiceDropzone component

export function NewInvoiceButton() {
    const [isOpen, setIsOpen] = useState(false)    // Handler for when files are accepted by the dropzone
    async function handleFilesAccepted(files: File[]) {
        try {
            // Process each file through the PDF extraction API
            for (const file of files) {
                const formData = new FormData()
                formData.append("file", file)

                const response = await fetch("/api/mock/pdf-extract", {
                    method: "POST",
                    body: formData,
                })

                if (!response.ok) {
                    throw new Error(`Error processing file ${file.name}`)
                }

                const data = await response.json()

                // TODO: Save the extracted data using a server action
                console.log("Extracted data:", data)
            }

            // Close the dialog after successful processing
            setIsOpen(false)

            // Show success message
            toast.success("Facturas procesadas correctamente", {
                description: "Los datos han sido extraídos y guardados."
            })
        } catch (error: unknown) {
            console.error("Error processing files:", error)
            toast.error("Error al procesar las facturas", {
                description: (error instanceof Error) ? error.message : "Ocurrió un error inesperado"
            })
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Nueva Factura
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Subir Nuevas Facturas</DialogTitle>
                    <DialogDescription>
                        Arrastra y suelta tus archivos PDF de factura aquí o haz clic para
                        seleccionarlos.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <InvoiceDropzone onFilesAccepted={handleFilesAccepted} />
                </div>
                {/* Optional: Add DialogFooter with upload/cancel buttons later */}
            </DialogContent>
        </Dialog>
    )
} 