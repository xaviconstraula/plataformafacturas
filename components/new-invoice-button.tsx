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

// TODO: Import and implement InvoiceDropzone component

export function NewInvoiceButton() {
    const [isOpen, setIsOpen] = useState(false)

    // Handler for when files are accepted by the dropzone
    function handleFilesAccepted(files: File[]) {
        console.log('Accepted files:', files)
        // Here you would typically initiate the upload process or pass files to another handler
        // For example, you might call a server action to process these files.
        // After processing, you might want to close the dialog:
        // setIsOpen(false);
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