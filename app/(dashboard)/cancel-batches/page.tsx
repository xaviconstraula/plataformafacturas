'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cancelAllBatches } from '@/lib/actions/invoices'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function CancelBatchesPage() {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    const { toast } = useToast()

    async function handleCancel() {
        setIsLoading(true)
        try {
            const result = await cancelAllBatches()

            if (result.success) {
                toast({
                    title: 'Success',
                    description: result.message,
                })
            } else {
                toast({
                    title: 'Error',
                    description: result.message,
                    variant: 'destructive',
                })
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to cancel batches',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
            setTimeout(() => router.back(), 1500)
        }
    }

    return (
        <div className="container mx-auto py-8 max-w-md">
            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Cancel All Processing Batches?</CardTitle>
                    <CardDescription>
                        Are you sure you want to cancel all active batch processing jobs? This action cannot be undone.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4 justify-end">
                    <Button
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={isLoading}
                    >
                        No, Keep Processing
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={isLoading}
                        className="min-w-[120px]"
                    >
                        {isLoading ? 'Cancelling...' : 'Yes, Cancel All'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
