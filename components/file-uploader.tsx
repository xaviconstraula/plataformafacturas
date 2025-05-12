"use client"

import type React from "react"

import { useState, useRef } from "react"
import { FileIcon, UploadIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface FileUploaderProps {
  onFileUpload: (file: File) => void
  isUploading: boolean
  progress: number
}

export function FileUploader({ onFileUpload, isUploading, progress }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.type === "application/pdf") {
        setFile(selectedFile)
        onFileUpload(selectedFile)
      } else {
        alert("Por favor, seleccione un archivo PDF.")
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.type === "application/pdf") {
        setFile(droppedFile)
        onFileUpload(droppedFile)
      } else {
        alert("Por favor, seleccione un archivo PDF.")
      }
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="w-full">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf" className="hidden" />

      {!file && !isUploading ? (
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <UploadIcon className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">Arrastre y suelte su archivo PDF aquí</h3>
          <p className="mb-4 text-sm text-muted-foreground">o haga clic en el botón para seleccionar un archivo</p>
          <Button onClick={handleButtonClick}>Seleccionar Archivo</Button>
        </div>
      ) : (
        <div className="rounded-lg border p-4">
          {isUploading ? (
            <div className="space-y-4">
              <div className="flex items-center">
                <FileIcon className="mr-2 h-6 w-6 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{file?.name}</p>
                  <p className="text-sm text-muted-foreground">{Math.round(progress)}% completado</p>
                </div>
              </div>
              <Progress value={progress} className="h-2 w-full" />
            </div>
          ) : (
            <div className="flex items-center">
              <FileIcon className="mr-2 h-6 w-6 text-primary" />
              <div className="flex-1">
                <p className="font-medium">{file?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {file?.size ? (file.size / 1024).toFixed(2) + " KB" : ""}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isUploading}>
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
