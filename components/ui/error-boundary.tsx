'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
    children: ReactNode
    fallback?: ReactNode
    onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    }

    public static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error
        }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo)
        this.props.onError?.(error, errorInfo)
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null })
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }

            return (
                <Card className="w-full max-w-md mx-auto">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <AlertTriangle className="h-12 w-12 text-destructive" />
                        </div>
                        <CardTitle className="text-destructive">
                            Algo salió mal
                        </CardTitle>
                        <CardDescription>
                            Ha ocurrido un error inesperado. Por favor, intenta nuevamente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        {this.state.error && (
                            <details className="text-sm text-left bg-muted p-3 rounded">
                                <summary className="cursor-pointer font-medium">
                                    Detalles del error
                                </summary>
                                <pre className="mt-2 text-xs overflow-auto">
                                    {this.state.error.message}
                                </pre>
                            </details>
                        )}
                        <Button onClick={this.handleRetry} variant="outline" className="w-full">
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Intentar nuevamente
                        </Button>
                    </CardContent>
                </Card>
            )
        }

        return this.props.children
    }
}

// Hook version for functional components
export function withErrorBoundary<T extends object>(
    Component: React.ComponentType<T>,
    errorBoundaryProps?: Omit<Props, 'children'>
) {
    const WrappedComponent = (props: T) => (
        <ErrorBoundary {...errorBoundaryProps}>
            <Component {...props} />
        </ErrorBoundary>
    )

    WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

    return WrappedComponent
}

// Simple error fallback component
export function ErrorFallback({
    error,
    resetErrorBoundary
}: {
    error: Error
    resetErrorBoundary: () => void
}) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error de carga</h2>
            <p className="text-sm text-muted-foreground mb-4">
                No se pudo cargar este contenido
            </p>
            <Button onClick={resetErrorBoundary} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar
            </Button>
        </div>
    )
}

// Async boundary for handling async component errors
export function AsyncErrorBoundary({
    children,
    fallback
}: {
    children: ReactNode
    fallback?: ReactNode
}) {
    return (
        <ErrorBoundary
            fallback={fallback || <ErrorFallback error={new Error('Error de carga')} resetErrorBoundary={() => window.location.reload()} />}
        >
            {children}
        </ErrorBoundary>
    )
} 