import { NextResponse } from "next/server"
import { filterInvoices, simulateCreateInvoice } from "@/lib/mock-data"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month")
    const quarter = searchParams.get("quarter")
    const year = searchParams.get("year")
    const supplier = searchParams.get("supplier")
    const search = searchParams.get("search")

    const invoices = filterInvoices({
      month,
      quarter,
      year,
      supplier,
      searchTerm: search,
    })

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
