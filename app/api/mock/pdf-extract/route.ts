import { NextResponse } from "next/server"
import { simulatePdfExtraction } from "@/lib/mock-data"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { fileUrl } = body

    // Simulamos la extracción de datos del PDF
    // En una implementación real, aquí descargaríamos el archivo y lo procesaríamos
    const mockFile = new File(["dummy content"], "invoice.pdf", { type: "application/pdf" })
    const extractedData = await simulatePdfExtraction(mockFile)

    return NextResponse.json(extractedData)
  } catch (error) {
    console.error("Error al procesar el PDF:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}
