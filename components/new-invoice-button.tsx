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
import { toast } from 'sonner'
import type { CreateInvoiceResult } from '@/lib/actions/invoices'

export function NewInvoiceButton() {
    const [isOpen, setIsOpen] = useState(false)

    // This function will be called by InvoiceDropzone when its internal processing is done.
    function handleInvoiceProcessingCompletion(results?: CreateInvoiceResult[]) {
        setIsOpen(false)
        // Display toasts based on results
        if (results) {
            results.forEach(result => {
                if (!result.success) {
                    toast.error(result.message, {
                        description: result.fileName ? `File: ${result.fileName}` : undefined,
                    });
                } else if (result.message.includes("already exists")) {
                    toast.info(result.message, {
                        description: result.fileName ? `File: ${result.fileName}` : undefined,
                    });
                } else {
                    // Optionally, show a success toast for each successful upload
                    // toast.success(result.message, {
                    //     description: result.fileName ? `File: ${result.fileName}` : undefined,
                    // });
                }
            });

            const successfulUploads = results.filter(r => r.success && !r.message.includes("already exists")).length;
            const skippedUploads = results.filter(r => r.success && r.message.includes("already exists")).length;
            const failedUploads = results.filter(r => !r.success).length;

            if (successfulUploads > 0 && failedUploads === 0 && skippedUploads === 0) {
                toast.success(`Successfully processed ${successfulUploads} invoice${successfulUploads > 1 ? 's' : ''}.`);
            } else if (successfulUploads === 0 && failedUploads > 0 && skippedUploads === 0) {
                // Errors are already shown individually
            } else if (successfulUploads === 0 && failedUploads === 0 && skippedUploads > 0) {
                toast.info(`${skippedUploads} invoice${skippedUploads > 1 ? 's were' : ' was'} skipped as ${skippedUploads > 1 ? 'they' : 'it'} already exist${skippedUploads > 1 ? '' : 's'}.`);
            } else if (results.length > 0) {
                // Mixed results, individual toasts should cover this.
                // You could add a summary toast here if desired.
                // For example:
                // toast.info(\`Processing complete: ${successfulUploads} successful, ${failedUploads} failed, ${skippedUploads} skipped.\`);
            }


        } else {
            // This case should ideally not happen if InvoiceDropzone always provides results.
            // Consider a generic error toast if results are unexpectedly undefined.
            toast.error("An unexpected error occurred during processing.");
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
                        seleccionarlos. Las facturas duplicadas (mismo código y proveedor) se omitirán automáticamente.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {/* 
                      InvoiceDropzone now handles the file processing and server action call.
                      The onProcessingComplete prop is used here to signal completion and pass results from InvoiceDropzone
                      so that the dialog can be closed and toasts can be shown.
                    */}
                    <InvoiceDropzone onProcessingComplete={handleInvoiceProcessingCompletion} />
                </div>
            </DialogContent>
        </Dialog>
    )
} 