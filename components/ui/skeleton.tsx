import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-muted", className)}
            {...props}
        />
    )
}

// Card skeleton for general use
function CardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn("rounded-lg border p-4 space-y-4", className)}>
            <div className="flex items-center space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        </div>
    )
}

// Table skeleton for data tables
function TableSkeleton({
    rows = 5,
    columns = 4,
    className
}: {
    rows?: number
    columns?: number
    className?: string
}) {
    return (
        <div className={cn("w-full", className)}>
            <div className="rounded-md border">
                <div className="border-b p-4">
                    <div className="flex space-x-4">
                        {Array.from({ length: columns }).map((_, i) => (
                            <Skeleton key={i} className="h-4 w-24" />
                        ))}
                    </div>
                </div>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="border-b p-4 last:border-b-0">
                        <div className="flex space-x-4">
                            {Array.from({ length: columns }).map((_, j) => (
                                <Skeleton key={j} className="h-4 w-20" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Dashboard stats skeleton
function DashboardStatsSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} className="h-24" />
            ))}
        </div>
    )
}

// Chart skeleton
function ChartSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn("rounded-lg border p-4", className)}>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-16" />
                </div>
                <div className="h-[300px] w-full flex items-end space-x-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton
                            key={i}
                            className="flex-1"
                            style={{ height: `${50 + (i * 20)}px` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

// Invoice list skeleton
function InvoiceListSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

// Material analytics skeleton
function MaterialAnalyticsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} className="h-32" />
                ))}
            </div>
            <ChartSkeleton className="h-[400px]" />
            <TableSkeleton rows={8} columns={6} />
        </div>
    )
}

// Supplier analytics skeleton
function SupplierAnalyticsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} className="h-32" />
                ))}
            </div>
            <ChartSkeleton className="h-[400px]" />
            <TableSkeleton rows={8} columns={5} />
        </div>
    )
}

// Price alerts skeleton
function PriceAlertsSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4">
                    <div className="flex items-start space-x-4">
                        <Skeleton className="h-5 w-5 mt-0.5" />
                        <div className="space-y-2 flex-1">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-5 w-12" />
                            </div>
                            <Skeleton className="h-3 w-48" />
                            <div className="flex justify-between">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                            <div className="flex justify-between">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

// Work orders skeleton
function WorkOrdersSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} className="h-24" />
                ))}
            </div>
            <TableSkeleton rows={10} columns={5} />
        </div>
    )
}

// Form skeleton
function FormSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ))}
            <div className="flex justify-end space-x-2">
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-20" />
            </div>
        </div>
    )
}

// Page skeleton for full page loading
function PageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-96" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} className="h-32" />
                ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <ChartSkeleton className="h-[300px]" />
                <ChartSkeleton className="h-[300px]" />
            </div>
        </div>
    )
}

export {
    Skeleton,
    CardSkeleton,
    TableSkeleton,
    DashboardStatsSkeleton,
    ChartSkeleton,
    InvoiceListSkeleton,
    MaterialAnalyticsSkeleton,
    SupplierAnalyticsSkeleton,
    PriceAlertsSkeleton,
    WorkOrdersSkeleton,
    FormSkeleton,
    PageSkeleton
} 