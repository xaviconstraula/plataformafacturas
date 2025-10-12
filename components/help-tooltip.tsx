"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { HelpCircleIcon } from "lucide-react"

interface HelpTooltipProps {
    title: string
    description: string
    content: React.ReactNode
    trigger?: React.ReactNode
}

export function HelpTooltip({ title, description, content, trigger }: HelpTooltipProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <HelpCircleIcon className="h-4 w-4" />
                        <span className="sr-only">Ayuda</span>
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        {description}
                    </p>
                </DialogHeader>
                <div className="space-y-4">
                    {content}
                </div>
            </DialogContent>
        </Dialog>
    )
} 