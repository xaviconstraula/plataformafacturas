import { NextResponse } from "next/server"
import { filterInvoices, simulateCreateInvoice } from "@/lib/mock-data"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Convert null values to undefined
    const params = {
      month: searchParams.get("month") || undefined,
      quarter: searchParams.get("quarter") || undefined,
      year: searchParams.get("year") || undefined,
      supplier: searchParams.get("supplier") || undefined,
      searchTerm: searchParams.get("search") || undefined,
    }

    const invoices = filterInvoices(params)

    return NextResponse.json(invoices)
  } catch (error) {
    console.error("Error al obtener las facturas:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const newInvoice = await simulateCreateInvoice(body)
    return NextResponse.json(newInvoice, { status: 201 })
  } catch (error) {
    console.error("Error al crear la factura:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}
