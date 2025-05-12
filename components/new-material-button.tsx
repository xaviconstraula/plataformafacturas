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
import { MaterialForm } from '@/components/material-form' // This will be created next

export function NewMaterialButton() {
    const [isOpen, setIsOpen] = useState(false)

    function handleFormSuccess() {
        setIsOpen(false)
        // Add toast notification / revalidation if needed
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Nuevo Material
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Añadir Nuevo Material</DialogTitle>
                    <DialogDescription>
                        Completa los detalles para registrar un nuevo material. Los campos marcados con * son obligatorios.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <MaterialForm onSuccess={handleFormSuccess} />
                </div>
            </DialogContent>
        </Dialog>
    )
} 