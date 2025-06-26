'use client'

import { useCallback, useState, useEffect } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { UploadCloudIcon, XIcon, FileIcon, BotIcon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createInvoiceFromFiles, type CreateInvoiceResult } from '@/lib/actions/invoices'

interface InvoiceDropzoneProps {
    onProcessingComplete?: (results: CreateInvoiceResult[]) => void;
    onProcessingStart?: () => void;
    className?: string
}

export function InvoiceDropzone({ onProcessingComplete, onProcessingStart, className }: InvoiceDropzoneProps) {
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [loadingStep, setLoadingStep] = useState<'processing' | 'analyzing'>('processing');
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

    useEffect(() => {
        let timerId: ReturnType<typeof setTimeout> | undefined;
        if (isUploading && loadingStep === 'processing') {
            timerId = setTimeout(() => {
                setLoadingStep('analyzing');
            }, 3000); // 3 seconds delay
        }
        return () => {
            if (timerId) clearTimeout(timerId);
        };
    }, [isUploading, loadingStep]);

    useEffect(() => {
        if (!isUploading) {
            setLoadingStep('processing');
        }
    }, [isUploading]);

    const onDrop = useCallback(
        (acceptedFiles: File[], fileRejections: FileRejection[]) => {
            if (fileRejections.length > 0) {
                fileRejections.forEach(({ file, errors }) => {
                    errors.forEach((err) => {
                        // Error toasts will be handled by the parent component via onProcessingComplete
                        // toast.error(`Error al subir archivo con "${file.name}"`, {
                        //     description: err.message,
                        // });
                    })
                })
            }

            const validFiles = acceptedFiles.filter(file => {
                if (file.size > 5 * 1024 * 1024) {
                    // This initial validation toast can stay or be moved to parent
                    // For now, keeping it here for immediate feedback on drop.
                    toast.error(`El archivo ${file.name} es demasiado grande`, {
                        description: "El tamaño máximo permitido es 5MB"
                    })
                    return false
                }
                return true
            })

            setFiles((prevFiles) => [...prevFiles, ...validFiles])
        },
        [],
    )

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
        },
        maxSize: 5 * 1024 * 1024, // 5MB limit per file
    })

    function removeFile(index: number) {
        setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index))
    }

    async function handleSubmitInvoices() {
        if (files.length === 0) {
            toast.info("No files selected", {
                description: "Please select one or more PDF files to process.",
            });
            return;
        }

        if (onProcessingStart) {
            onProcessingStart();
        }
        setIsUploading(true);
        const filesToProcess = [...files]; // Copy files to a new array
        setFiles([]); // Clear files from UI immediately

        toast.info("Iniciando procesamiento de facturas", {
            description: "Las facturas se procesarán en segundo plano. La página se actualizará automáticamente para mostrar el progreso.",
        });

        const operationResults: CreateInvoiceResult[] = [];
        let batchId: string | undefined;

        try {
            // Process all files in a single call to maintain batch integrity
            const formData = new FormData();
            filesToProcess.forEach((file) => {
                formData.append("files", file);
            });

            console.log(`Processing ${filesToProcess.length} files in a single batch`);

            const { results, batchId: returnedBatchId } = await createInvoiceFromFiles(formData);
            batchId = returnedBatchId;
            operationResults.push(...results);

            operationResults.forEach((result: CreateInvoiceResult) => {
                if (result.isBlockedProvider) {
                    const providerNameMatch = result.message.match(/Provider '(.+?)' is blocked/);
                    const providerName = providerNameMatch ? providerNameMatch[1] : 'Unknown';
                    const event = new CustomEvent('blockedProvider', {
                        detail: {
                            providerName,
                            fileName: result.fileName || 'Unknown file'
                        }
                    });
                    window.dispatchEvent(event);
                }
            });

        } catch (error) {
            console.error("Error creating invoices:", error);
            toast.warning("El procesamiento está tardando más de lo esperado", {
                description: "La carga de facturas continúa en segundo plano. La página se actualizará automáticamente cuando esté listo.",
            });

            // Even if there's an error, we still want to pass the batch ID if we have it
            // so the user can track progress
            if (batchId) {
                operationResults.push({
                    success: false,
                    message: "Processing timeout - continuing in background",
                    batchId: batchId,
                    fileName: "Batch Processing"
                });
            }
        } finally {
            setIsUploading(false);
            setUploadProgress(null);
            if (onProcessingComplete) {
                onProcessingComplete(operationResults);
            }
        }
    }

    return (
        <div className={cn('grid gap-4', className)}>
            <div
                {...getRootProps()}
                className={cn(
                    'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                    isDragActive
                        ? 'border-primary bg-primary/10'
                        : 'border-muted-foreground/50 bg-muted/20 hover:border-primary/80 hover:bg-primary/5',
                    files.length > 0 && 'border-primary/50 bg-primary/5',
                )}
            >
                <input {...getInputProps()} />
                <UploadCloudIcon
                    className={cn(
                        'mb-4 h-10 w-10 text-muted-foreground',
                        isDragActive && 'text-primary',
                    )}
                />
                {isDragActive ? (
                    <p className="font-semibold text-primary">Suelta los archivos aquí...</p>
                ) : (
                    <p className="text-muted-foreground">
                        Arrastra y suelta archivos PDF aquí, o haz clic para seleccionar
                    </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground/80">
                    Archivos PDF, hasta 5MB cada uno
                </p>
            </div>

            {files.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-medium">Archivos seleccionados:</h4>
                    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
                        {files.map((file, index) => (
                            <li
                                key={`${file.name}-${index}`}
                                className="flex items-center justify-between rounded-md p-1.5 text-sm hover:bg-muted/50"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    <span className="flex-1 truncate" title={file.name}>
                                        {file.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        ({(file.size / 1024).toFixed(1)} KB)
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 flex-shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation() // Prevent triggering dropzone click
                                        removeFile(index)
                                    }}
                                >
                                    <XIcon className="h-3 w-3" />
                                    <span className="sr-only">Eliminar archivo</span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                    <Button
                        onClick={handleSubmitInvoices}
                        className="w-full"
                        disabled={isUploading || files.length === 0}
                    >
                        {isUploading ? (
                            <div className="flex items-center justify-center gap-2 relative h-5">
                                {/* Processing Step */}
                                <div
                                    className={cn(
                                        "absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300 ease-in-out",
                                        loadingStep === 'processing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                    )}
                                >
                                    <Loader2Icon className="h-4 w-4 animate-spin" />
                                    <span>
                                        {uploadProgress ?
                                            `Procesando lote ${uploadProgress.current}/${uploadProgress.total}...` :
                                            'Procesando...'
                                        }
                                    </span>
                                </div>

                                {/* Analyzing Step */}
                                <div
                                    className={cn(
                                        "absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300 ease-in-out",
                                        loadingStep === 'analyzing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                    )}
                                >
                                    <BotIcon className="h-4 w-4 animate-pulse" />
                                    <span>
                                        {uploadProgress ?
                                            `Analizando lote ${uploadProgress.current}/${uploadProgress.total}...` :
                                            'Analizando...'
                                        }
                                    </span>
                                </div>
                            </div>
                        ) : (
                            `Procesar ${files.length} Factura${files.length > 1 ? 's' : ''}`
                        )}
                    </Button>
                </div>
            )}
        </div>
    )
}
