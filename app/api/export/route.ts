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
            supplierCif: body.supplierCif,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
            minPrice: body.minPrice ? Number(body.minPrice) : undefined,
            maxPrice: body.maxPrice ? Number(body.maxPrice) : undefined,
            fiscalYear: body.fiscalYear ? Number(body.fiscalYear) : undefined,
            naturalYear: body.naturalYear ? Number(body.naturalYear) : undefined,
            // Additional filters for materials page
            materialSearch: body.materialSearch,
            minUnitPrice: body.minUnitPrice ? Number(body.minUnitPrice) : undefined,
            maxUnitPrice: body.maxUnitPrice ? Number(body.maxUnitPrice) : undefined,
            minTotalCost: body.minTotalCost ? Number(body.minTotalCost) : undefined,
            maxTotalCost: body.maxTotalCost ? Number(body.maxTotalCost) : undefined,
            minQuantity: body.minQuantity ? Number(body.minQuantity) : undefined,
            maxQuantity: body.maxQuantity ? Number(body.maxQuantity) : undefined,
        };

        const includeDetails = body.includeDetails !== false; // Default to true

        const buffer = await generateExcelReport(filters, includeDetails);

        // Generate filename with current date and work order info
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        let filename = `facturas_reporte_${dateStr}.xlsx`;

        if (filters.workOrder) {
            const sanitizedWorkOrder = filters.workOrder.replace(/[^a-zA-Z0-9-_]/g, '_');
            filename = `OT_${sanitizedWorkOrder}_${dateStr}.xlsx`;
        }

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
        supplierCif: searchParams.get('supplierCif') || undefined,
        startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
        endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
        minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
        maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
        fiscalYear: searchParams.get('fiscalYear') ? Number(searchParams.get('fiscalYear')) : undefined,
        naturalYear: searchParams.get('naturalYear') ? Number(searchParams.get('naturalYear')) : undefined,
        // Additional filters for materials page
        materialSearch: searchParams.get('materialSearch') || undefined,
        minUnitPrice: searchParams.get('minUnitPrice') ? Number(searchParams.get('minUnitPrice')) : undefined,
        maxUnitPrice: searchParams.get('maxUnitPrice') ? Number(searchParams.get('maxUnitPrice')) : undefined,
        minTotalCost: searchParams.get('minTotalCost') ? Number(searchParams.get('minTotalCost')) : undefined,
        maxTotalCost: searchParams.get('maxTotalCost') ? Number(searchParams.get('maxTotalCost')) : undefined,
        minQuantity: searchParams.get('minQuantity') ? Number(searchParams.get('minQuantity')) : undefined,
        maxQuantity: searchParams.get('maxQuantity') ? Number(searchParams.get('maxQuantity')) : undefined,
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