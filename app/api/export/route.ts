import { NextRequest, NextResponse } from 'next/server';
import { generateExcelReport, ExportFilters } from '@/lib/actions/export';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const filters: ExportFilters = {
            materialId: body.materialId,
            category: body.category,
            workOrder: body.workOrder,
            supplierId: body.supplierId,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
            minPrice: body.minPrice ? Number(body.minPrice) : undefined,
            maxPrice: body.maxPrice ? Number(body.maxPrice) : undefined,
            fiscalYear: body.fiscalYear ? Number(body.fiscalYear) : undefined,
            naturalYear: body.naturalYear ? Number(body.naturalYear) : undefined,
        };

        const includeDetails = body.includeDetails !== false; // Default to true

        const buffer = await generateExcelReport(filters, includeDetails);

        // Generate filename with current date
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const filename = `facturas_reporte_${dateStr}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': buffer.length.toString(),
            },
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json(
            { error: 'Error generating Excel report' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const filters: ExportFilters = {
        materialId: searchParams.get('materialId') || undefined,
        category: searchParams.get('category') || undefined,
        workOrder: searchParams.get('workOrder') || undefined,
        supplierId: searchParams.get('supplierId') || undefined,
        startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
        endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
        minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
        maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
        fiscalYear: searchParams.get('fiscalYear') ? Number(searchParams.get('fiscalYear')) : undefined,
        naturalYear: searchParams.get('naturalYear') ? Number(searchParams.get('naturalYear')) : undefined,
    };

    const includeDetails = searchParams.get('includeDetails') !== 'false';

    try {
        const buffer = await generateExcelReport(filters, includeDetails);

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const filename = `facturas_reporte_${dateStr}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': buffer.length.toString(),
            },
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json(
            { error: 'Error generating Excel report' },
            { status: 500 }
        );
    }
} 