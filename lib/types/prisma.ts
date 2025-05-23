import { type Material, type Provider } from '@/generated/prisma'

export type AlertStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface PriceAlert {
    id: string
    material: Pick<Material, 'id' | 'name'>
    provider: Pick<Provider, 'id' | 'name'>
    previousPrice: number
    currentPrice: number
    percentageChange: number
    createdAt: string
    effectiveDate: string
    issueDate: string
    status: AlertStatus
} 