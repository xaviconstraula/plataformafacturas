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
import { SupplierForm } from '@/components/supplier-form'

export function NewSupplierButton() {
    const [isOpen, setIsOpen] = useState(false)

    function handleFormSuccess() {
        setIsOpen(false)
        // Here you might want to add a toast notification for success
        // and potentially trigger a re-fetch or revalidation if not handled by the action itself
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Nuevo Proveedor
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Añadir Nuevo Proveedor</DialogTitle>
                    <DialogDescription>
                        Completa los detalles para registrar un nuevo proveedor. Los campos marcados con * son obligatorios.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <SupplierForm onSuccess={handleFormSuccess} />
                </div>
            </DialogContent>
        </Dialog>
    )
} 