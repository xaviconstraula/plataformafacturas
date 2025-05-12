import { NextResponse } from "next/server"
import { priceAlerts, simulateUpdateAlert } from "@/lib/mock-data"

export async function GET() {
  try {
    return NextResponse.json(priceAlerts)
  } catch (error) {
    console.error("Error al obtener las alertas:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: "Se requiere ID y estado" }, { status: 400 })
    }

    const updatedAlert = await simulateUpdateAlert(id, status)
    return NextResponse.json(updatedAlert)
  } catch (error) {
    console.error("Error al actualizar la alerta:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}
