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

export function NewInvoiceButton() {
    const [isOpen, setIsOpen] = useState(false)

    // This function will be called by InvoiceDropzone when its internal processing is done.
    function handleInvoiceProcessingCompletion() {
        setIsOpen(false)
        // Toast messages are now handled within InvoiceDropzone based on createInvoiceFromFiles results
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
                        seleccionarlos. Las facturas duplicadas (mismo código y proveedor) se omitirán automáticamente.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {/* 
                      InvoiceDropzone now handles the file processing and server action call.
                      The onFilesAccepted prop is used here to signal completion from InvoiceDropzone
                      so that the dialog can be closed.
                    */}
                    <InvoiceDropzone onFilesAccepted={handleInvoiceProcessingCompletion} />
                </div>
            </DialogContent>
        </Dialog>
    )
} 