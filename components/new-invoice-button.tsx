'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { PlusIcon, Loader2 } from 'lucide-react'
import { InvoiceDropzone } from '@/components/invoice-dropzone'
import { toast } from 'sonner'
import type { CreateInvoiceResult } from '@/lib/actions/invoices'

export function NewInvoiceButton() {
    const [isOpen, setIsOpen] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)

    // Prevent tab closure while processing
    useEffect(() => {
        function handleBeforeUnload(event: BeforeUnloadEvent) {
            if (isProcessing) {
                event.preventDefault();
                event.returnValue = '';
                return '';
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isProcessing]);

    // Listen for custom event to close modal
    useEffect(() => {
        const handleCloseModal = () => {
            setIsOpen(false);
        };

        window.addEventListener('closeInvoiceModal', handleCloseModal);

        return () => {
            window.removeEventListener('closeInvoiceModal', handleCloseModal);
        };
    }, []);

    // This function will be called by InvoiceDropzone when its internal processing is done.
    function handleInvoiceProcessingCompletion(results?: CreateInvoiceResult[]) {
        setIsProcessing(false)
        setIsOpen(false)
        if (!results || results.length === 0) {
            toast.error("Error inesperado", {
                description: "No se recibió respuesta del servidor. Por favor, revisa los logs del servidor para más detalles."
            });
            return;
        }

        // If the first result contains a batchId, we know the new Batch API flow is active.
        const batchId = results[0]?.batchId;
        if (batchId) {
            toast.success("Procesamiento iniciado", {
                description: "Las facturas se están procesando en segundo plano. La página se actualizará automáticamente cuando estén listas.",
            });
            return; // No further per-file toasts; banner will take over.
        }

        // Legacy per-file behaviour (manual invoices or non-batch uploads)
        results.forEach(result => {
            if (!result.success) {
                if (!result.isBlockedProvider) {
                    toast.error(result.message, {
                        description: result.fileName ? `File: ${result.fileName}` : undefined,
                    });
                }
            } else if (result.message.includes("already exists")) {
                toast.info(result.message, {
                    description: result.fileName ? `File: ${result.fileName}` : undefined,
                });
            }
        });

        const successfulUploads = results.filter(r => r.success && !r.message.includes("already exists")).length;
        const skippedUploads = results.filter(r => r.success && r.message.includes("already exists")).length;
        const failedUploads = results.filter(r => !r.success).length;

        if (successfulUploads > 0 && failedUploads === 0 && skippedUploads === 0) {
            toast.success(`Han sido procesadas ${successfulUploads} factura${successfulUploads > 1 ? 's' : ''}.`);
        } else if (successfulUploads === 0 && failedUploads === 0 && skippedUploads > 0) {
            toast.info(`${skippedUploads} invoice${skippedUploads > 1 ? 's were' : ' was'} skipped as ${skippedUploads > 1 ? 'they' : 'it'} already exist${skippedUploads > 1 ? '' : 's'}.`);
        }
    }

    // Called when processing starts in InvoiceDropzone
    function handleInvoiceProcessingStart() {
        setIsProcessing(true)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button disabled={isProcessing}>
                    {isProcessing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando
                        </>
                    ) : (
                        <>
                            <PlusIcon className="h-4 w-4" /> Añadir Facturas
                        </>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Subir Nuevas Facturas</DialogTitle>
                    <DialogDescription>
                        Arrastra y suelta tus archivos PDF de factura aquí o haz clic para
                        seleccionarlos. Las facturas duplicadas (mismo código y proveedor) se omitirán automáticamente.
                        <br />
                        <br />
                        <strong>Esta operación puede tardar varios minutos.</strong>
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <InvoiceDropzone
                        onProcessingStart={handleInvoiceProcessingStart}
                        onProcessingComplete={handleInvoiceProcessingCompletion}
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
} 