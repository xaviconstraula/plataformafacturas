import { Progress } from "@/components/ui/progress"

interface BatchProgressIndicatorProps {
    processedFiles: number
    totalFiles: number
    currentFile?: string | null
    label?: string
    className?: string
}

export function BatchProgressIndicator({
    processedFiles,
    totalFiles,
    currentFile,
    label = "Procesando",
    className,
}: BatchProgressIndicatorProps) {
    const safeTotal = Math.max(totalFiles, 1)
    const percent = Math.min(100, Math.round((processedFiles / safeTotal) * 100))

    return (
        <div className={className ?? "space-y-2"}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{label} {processedFiles}/{totalFiles}</span>
                <span>{percent}%</span>
            </div>
            <Progress value={percent} className="h-2" />
            {currentFile ? (
                <p className="text-xs text-muted-foreground truncate" title={currentFile}>
                    {currentFile}
                </p>
            ) : null}
        </div>
    )
}
