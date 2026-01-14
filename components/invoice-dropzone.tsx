'use client'

import { useCallback, useState, useEffect } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { UploadCloudIcon, XIcon, FileIcon, BotIcon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { startInvoiceBatch, type CreateInvoiceResult } from '@/lib/actions/invoices'

interface InvoiceDropzoneProps {
    onProcessingComplete?: (results: CreateInvoiceResult[]) => void;
    onProcessingStart?: () => void;
    className?: string
}

export function InvoiceDropzone({ onProcessingComplete, onProcessingStart, className }: InvoiceDropzoneProps) {
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [waitingForBanner, setWaitingForBanner] = useState(false)
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
                if (file.size > 500 * 1024 * 1024) { // Increased from 5MB to 500MB
                    // This initial validation toast can stay or be moved to parent
                    // For now, keeping it here for immediate feedback on drop.
                    toast.error(`El archivo ${file.name} es demasiado grande`, {
                        description: "El tamaño máximo permitido es 500MB"
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
        maxSize: 500 * 1024 * 1024, // Increased from 5MB to 500MB per file
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

        // 🚧  Split huge selections into smaller requests so Next.js does not
        //     need to buffer hundreds of MB in a single multipart body. Each
        //     sub-batch will be processed independently by the server.
        const MAX_FILES_PER_REQUEST = 150; // 150 × 500 MB ≈ 75 GB (worst-case)
        const chunks: File[][] = [];
        for (let i = 0; i < filesToProcess.length; i += MAX_FILES_PER_REQUEST) {
            chunks.push(filesToProcess.slice(i, i + MAX_FILES_PER_REQUEST));
        }

        // Track progress across all chunks
        setUploadProgress({ current: 0, total: chunks.length });

        toast.info("Iniciando procesamiento de facturas", {
            description: "Las facturas se procesarán en segundo plano. La página se actualizará automáticamente para mostrar el progreso.",
        });

        const operationResults: CreateInvoiceResult[] = [];

        // 🚀  Optimistically show the processing banner right away so the user gets
        //     instant feedback without waiting for the server to finish heavy work.
        const earlyBatchEvent = new CustomEvent('batchCreated', {
            detail: { totalFiles: filesToProcess.length },
        });
        window.dispatchEvent(earlyBatchEvent);
        setWaitingForBanner(true);

        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];

            try {
                const formData = new FormData();
                chunk.forEach((file) => {
                    formData.append('files', file);
                });

                console.log(`▶️  Sub-batch ${idx + 1}/${chunks.length} – ${chunk.length} archivos`);
                const { batchId } = await startInvoiceBatch(formData);

                operationResults.push({
                    success: true,
                    message: 'Batch enqueued',
                    batchId,
                    fileName: `${chunk.length} archivos (sub-batch ${idx + 1})`,
                });

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
                console.error(`❌ Error creating sub-batch ${idx + 1}/${chunks.length}:`, errorMessage, error);

                // Add error result to the array so parent knows what happened
                operationResults.push({
                    success: false,
                    message: `Error en sub-lote ${idx + 1}: ${errorMessage}`,
                    fileName: `${chunk.length} archivos (sub-batch ${idx + 1})`,
                });

                toast.error("Error procesando sub-lote", {
                    description: errorMessage,
                });
            } finally {
                // Update progress for the UI loader (“Procesando lote …”)
                setUploadProgress({ current: idx + 1, total: chunks.length });
            }
        }

        // Finalize upload state
        setUploadProgress(null);
        if (onProcessingComplete) {
            onProcessingComplete(operationResults);
        }
        if (!waitingForBanner) {
            setIsUploading(false);
        }
    }

    // Listen for the banner becoming visible so we can hide the button loader.
    useEffect(() => {
        const stopSpinner = () => {
            setWaitingForBanner(false)
            setIsUploading(false)
        }

        window.addEventListener('batchBannerReady', stopSpinner)

        return () => {
            window.removeEventListener('batchBannerReady', stopSpinner)
        }
    }, [])

    // Fallback: if something goes wrong and the banner never appears, release
    // the loading state to avoid trapping the user.
    useEffect(() => {
        if (waitingForBanner) {
            const timer = setTimeout(() => {
                setWaitingForBanner(false);
                setIsUploading(false);
            }, 300000); // 5 min safety timeout
            return () => clearTimeout(timer);
        }
    }, [waitingForBanner]);

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
                    Archivos PDF, hasta 500MB cada uno
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
