'use client'

import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { UploadCloudIcon, XIcon, FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface InvoiceDropzoneProps {
    onFilesAccepted: (files: File[]) => void // Callback for when files are ready to be processed
    className?: string
}

export function InvoiceDropzone({ onFilesAccepted, className }: InvoiceDropzoneProps) {
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)

    const onDrop = useCallback(
        (acceptedFiles: File[], fileRejections: FileRejection[]) => {
            if (fileRejections.length > 0) {
                fileRejections.forEach(({ file, errors }) => {
                    errors.forEach((err) => {
                        toast.error(`Error al subir archivo con "${file.name}"`, {
                            description: err.message,
                        });
                    })
                })
            }

            // Filter out any files that are too large
            const validFiles = acceptedFiles.filter(file => {
                if (file.size > 5 * 1024 * 1024) {
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
    } async function handleUpload() {
        if (files.length > 0) {
            setIsUploading(true)
            try {
                await onFilesAccepted(files)
                setFiles([]) // Clear files after successful upload
            } catch (error) {
                console.error("Error uploading files:", error)
            } finally {
                setIsUploading(false)
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
                    </ul>                    <Button
                        onClick={handleUpload}
                        className="w-full"
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <div className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                <span>Procesando...</span>
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
