import { NextResponse } from 'next/server'
import { mergeProvidersAction } from '@/lib/actions/proveedores'

export async function POST(request: Request) {
    try {
        const { sourceProviderId, targetProviderId } = await request.json()

        const result = await mergeProvidersAction(sourceProviderId, targetProviderId)

        return NextResponse.json(result, { status: result.success ? 200 : 400 })
    } catch (error) {
        console.error('Merge providers API error:', error)
        return NextResponse.json({ success: false, message: 'Error inesperado.' }, { status: 500 })
    }
} 