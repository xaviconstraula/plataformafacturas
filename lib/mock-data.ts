export interface Supplier {
  id: string
  name: string
  type: string
  contactPerson: string
  email: string
  phone: string
  status: "active" | "inactive"
  createdAt: string
  updatedAt: string
}

export interface Material {
  id: string
  name: string
  category: string
  supplier: string
  lastPrice: number
  unit: string
  stock: number
}

export interface Invoice {
  id: string
  supplier: string
  code: string
  material: string
  quantity: number
  amount: number
  date: string
}

export interface PriceAlert {
  id: string
  material: string
  supplier: string
  previousPrice: number
  currentPrice: number
  percentageChange: number
  date: string
  status: "pending" | "approved" | "rejected"
}

// Datos simulados
export const suppliers: Supplier[] = [
  {
    id: "SUP001",
    name: "Aceros del Norte",
    type: "Metalúrgicos",
    contactPerson: "María García",
    email: "contacto@acerosdelnorte.es",
    phone: "+34 91 123 4567",
    status: "active",
    createdAt: "2025-01-15T10:30:00Z",
    updatedAt: "2025-03-20T14:45:00Z",
  },
  {
    id: "SUP002",
    name: "Químicos Industriales",
    type: "Químicos",
    contactPerson: "Juan Pérez",
    email: "info@quimicosindustriales.com",
    phone: "+34 93 234 5678",
    status: "active",
    createdAt: "2025-01-20T09:15:00Z",
    updatedAt: "2025-03-18T11:30:00Z",
  },
  {
    id: "SUP003",
    name: "Maderas Premium",
    type: "Madereros",
    contactPerson: "Ana Martínez",
    email: "ventas@maderaspremium.es",
    phone: "+34 96 345 6789",
    status: "active",
    createdAt: "2025-01-25T14:20:00Z",
    updatedAt: "2025-03-15T16:45:00Z",
  },
  {
    id: "SUP004",
    name: "Plásticos Modernos",
    type: "Químicos",
    contactPerson: "Carlos Rodríguez",
    email: "info@plasticosmodernos.com",
    phone: "+34 95 456 7890",
    status: "inactive",
    createdAt: "2025-02-01T08:45:00Z",
    updatedAt: "2025-03-10T10:15:00Z",
  },
  {
    id: "SUP005",
    name: "Metales Precisos",
    type: "Metalúrgicos",
    contactPerson: "Laura Sánchez",
    email: "contacto@metalesprecisos.es",
    phone: "+34 91 567 8901",
    status: "active",
    createdAt: "2025-02-05T11:30:00Z",
    updatedAt: "2025-03-05T13:20:00Z",
  },
  {
    id: "SUP006",
    name: "Vidrios Claros",
    type: "Vidrierías",
    contactPerson: "Roberto Fernández",
    email: "info@vidriosclaros.com",
    phone: "+34 94 678 9012",
    status: "active",
    createdAt: "2025-02-10T15:45:00Z",
    updatedAt: "2025-03-01T09:30:00Z",
  },
  {
    id: "SUP007",
    name: "Textiles Suaves",
    type: "Textiles",
    contactPerson: "Elena López",
    email: "ventas@textilessuaves.es",
    phone: "+34 92 789 0123",
    status: "active",
    createdAt: "2025-02-15T10:15:00Z",
    updatedAt: "2025-02-28T14:45:00Z",
  },
  {
    id: "SUP008",
    name: "Cerámicas Finas",
    type: "Cerámicos",
    contactPerson: "Miguel González",
    email: "info@ceramicasfinas.com",
    phone: "+34 97 890 1234",
    status: "inactive",
    createdAt: "2025-02-20T13:30:00Z",
    updatedAt: "2025-02-25T16:15:00Z",
  },
]

export const materials: Material[] = [
  {
    id: "MAT001",
    name: "Acero Inoxidable",
    category: "Metales",
    supplier: "Aceros del Norte",
    lastPrice: 450.0,
    unit: "Tonelada",
    stock: 12,
  },
  {
    id: "MAT002",
    name: "Solvente Industrial",
    category: "Químicos",
    supplier: "Químicos Industriales",
    lastPrice: 75.5,
    unit: "Litro",
    stock: 150,
  },
  {
    id: "MAT003",
    name: "Madera de Pino",
    category: "Maderas",
    supplier: "Maderas Premium",
    lastPrice: 120.0,
    unit: "Metro cúbico",
    stock: 45,
  },
  {
    id: "MAT004",
    name: "Polietileno",
    category: "Plásticos",
    supplier: "Plásticos Modernos",
    lastPrice: 85.25,
    unit: "Kilogramo",
    stock: 500,
  },
  {
    id: "MAT005",
    name: "Aluminio",
    category: "Metales",
    supplier: "Metales Precisos",
    lastPrice: 320.8,
    unit: "Tonelada",
    stock: 8,
  },
  {
    id: "MAT006",
    name: "Vidrio Templado",
    category: "Vidrios",
    supplier: "Vidrios Claros",
    lastPrice: 45.3,
    unit: "Metro cuadrado",
    stock: 75,
  },
  {
    id: "MAT007",
    name: "Algodón",
    category: "Textiles",
    supplier: "Textiles Suaves",
    lastPrice: 12.45,
    unit: "Kilogramo",
    stock: 200,
  },
  {
    id: "MAT008",
    name: "Porcelana",
    category: "Cerámicos",
    supplier: "Cerámicas Finas",
    lastPrice: 95.6,
    unit: "Kilogramo",
    stock: 30,
  },
  {
    id: "MAT009",
    name: "Cobre",
    category: "Metales",
    supplier: "Metales Precisos",
    lastPrice: 320.5,
    unit: "Tonelada",
    stock: 15,
  },
]

export const invoices: Invoice[] = [
  {
    id: "INV001",
    supplier: "Aceros del Norte",
    code: "AC-2025-001",
    material: "Acero Inoxidable",
    quantity: 500,
    amount: 1250.75,
    date: "2025-04-28",
  },
  {
    id: "INV002",
    supplier: "Químicos Industriales",
    code: "QI-2025-042",
    material: "Solvente Industrial",
    quantity: 200,
    amount: 875.5,
    date: "2025-04-25",
  },
  {
    id: "INV003",
    supplier: "Maderas Premium",
    code: "MP-2025-103",
    material: "Madera de Pino",
    quantity: 1000,
    amount: 2340.0,
    date: "2025-04-22",
  },
  {
    id: "INV004",
    supplier: "Plásticos Modernos",
    code: "PM-2025-076",
    material: "Polietileno",
    quantity: 750,
    amount: 1120.25,
    date: "2025-04-20",
  },
  {
    id: "INV005",
    supplier: "Metales Precisos",
    code: "ME-2025-054",
    material: "Aluminio",
    quantity: 300,
    amount: 3450.8,
    date: "2025-04-18",
  },
  {
    id: "INV006",
    supplier: "Vidrios Claros",
    code: "VC-2025-032",
    material: "Vidrio Templado",
    quantity: 150,
    amount: 1875.3,
    date: "2025-04-15",
  },
  {
    id: "INV007",
    supplier: "Textiles Suaves",
    code: "TS-2025-087",
    material: "Algodón",
    quantity: 2000,
    amount: 950.45,
    date: "2025-04-12",
  },
  {
    id: "INV008",
    supplier: "Cerámicas Finas",
    code: "CF-2025-021",
    material: "Porcelana",
    quantity: 100,
    amount: 2250.6,
    date: "2025-04-10",
  },
  {
    id: "INV009",
    supplier: "Papeles Reciclados",
    code: "PR-2025-065",
    material: "Papel Kraft",
    quantity: 5000,
    amount: 780.9,
    date: "2025-04-08",
  },
  {
    id: "INV010",
    supplier: "Cauchos Flexibles",
    code: "CA-2025-043",
    material: "Caucho Natural",
    quantity: 400,
    amount: 1650.2,
    date: "2025-04-05",
  },
]

export const priceAlerts: PriceAlert[] = [
  {
    id: "ALERT001",
    material: "Acero Inoxidable",
    supplier: "Aceros del Norte",
    previousPrice: 450.0,
    currentPrice: 540.0,
    percentageChange: 20,
    date: "2025-04-26",
    status: "pending",
  },
  {
    id: "ALERT002",
    material: "Cobre",
    supplier: "Metales Precisos",
    previousPrice: 320.5,
    currentPrice: 416.65,
    percentageChange: 30,
    date: "2025-04-24",
    status: "pending",
  },
  {
    id: "ALERT003",
    material: "Polietileno",
    supplier: "Plásticos Modernos",
    previousPrice: 180.25,
    currentPrice: 225.31,
    percentageChange: 25,
    date: "2025-04-22",
    status: "pending",
  },
  {
    id: "ALERT004",
    material: "Vidrio Templado",
    supplier: "Vidrios Claros",
    previousPrice: 45.3,
    currentPrice: 58.89,
    percentageChange: 30,
    date: "2025-04-20",
    status: "approved",
  },
  {
    id: "ALERT005",
    material: "Madera de Pino",
    supplier: "Maderas Premium",
    previousPrice: 120.0,
    currentPrice: 168.0,
    percentageChange: 40,
    date: "2025-04-18",
    status: "rejected",
  },
]

// Datos para gráficos
export const overviewData = [
  {
    name: "Ene",
    total: 18,
  },
  {
    name: "Feb",
    total: 22,
  },
  {
    name: "Mar",
    total: 25,
  },
  {
    name: "Abr",
    total: 19,
  },
  {
    name: "May",
    total: 28,
  },
  {
    name: "Jun",
    total: 32,
  },
]

export const materialsBySupplierData = [
  { name: "Acero", value: 35, supplier: "Metalúrgicos" },
  { name: "Madera", value: 25, supplier: "Madereros" },
  { name: "Plástico", value: 20, supplier: "Químicos" },
  { name: "Aluminio", value: 15, supplier: "Metalúrgicos" },
  { name: "Vidrio", value: 5, supplier: "Vidrierías" },
]

export const priceEvolutionData = [
  {
    month: "Ene",
    "Acero Inoxidable": 450,
    Aluminio: 320,
    Polietileno: 180,
  },
  {
    month: "Feb",
    "Acero Inoxidable": 450,
    Aluminio: 320,
    Polietileno: 180,
  },
  {
    month: "Mar",
    "Acero Inoxidable": 470,
    Aluminio: 330,
    Polietileno: 185,
  },
  {
    month: "Abr",
    "Acero Inoxidable": 540,
    Aluminio: 416,
    Polietileno: 225,
  },
  {
    month: "May",
    "Acero Inoxidable": 550,
    Aluminio: 420,
    Polietileno: 230,
  },
]

export const invoicesByPeriodData = [
  {
    name: "Q1",
    "2023": 45,
    "2024": 65,
    "2025": 85,
  },
  {
    name: "Q2",
    "2023": 50,
    "2024": 70,
    "2025": 90,
  },
  {
    name: "Q3",
    "2023": 55,
    "2024": 75,
    "2025": 0,
  },
  {
    name: "Q4",
    "2023": 60,
    "2024": 80,
    "2025": 0,
  },
]

// Datos detallados para la factura de ejemplo
export const invoiceDetail = {
  id: "INV001",
  supplier: "Aceros del Norte",
  code: "AC-2025-001",
  material: "Acero Inoxidable",
  quantity: 500,
  amount: 1250.75,
  date: "2025-04-28",
  notes: "Entrega en almacén central. Material verificado y aprobado por control de calidad.",
  supplierInfo: {
    name: "Aceros del Norte S.A.",
    address: "Av. Industrial 1234, Polígono Norte",
    city: "Madrid",
    postalCode: "28001",
    phone: "+34 91 123 4567",
    email: "contacto@acerosdelnorte.es",
    taxId: "A12345678",
  },
}

// Función para simular la extracción de datos de un PDF
export function simulatePdfExtraction(file: File): Promise<{
  supplier: string
  invoiceCode: string
  material: string
  quantity: number
  amount: number
  date: string
  confidence: number
}> {
  return new Promise((resolve) => {
    // Simulamos un tiempo de procesamiento
    setTimeout(() => {
      resolve({
        supplier: "Aceros del Norte",
        invoiceCode: `AC-2025-${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0")}`,
        material: "Acero Inoxidable",
        quantity: 500,
        amount: 1250.75,
        date: new Date().toISOString().split("T")[0],
        confidence: 0.85,
      })
    }, 2000)
  })
}

// Función para simular la creación de una factura
export function simulateCreateInvoice(data: {
  supplier: string
  invoiceCode: string
  material: string
  quantity: number
  amount: number
  date: string
  notes?: string
}): Promise<Invoice> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const newInvoice: Invoice = {
        id: `INV${Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, "0")}`,
        supplier: data.supplier,
        code: data.invoiceCode,
        material: data.material,
        quantity: data.quantity,
        amount: data.amount,
        date: data.date,
      }
      resolve(newInvoice)
    }, 1000)
  })
}

// Función para simular la actualización de una alerta
export function simulateUpdateAlert(id: string, status: "approved" | "rejected"): Promise<PriceAlert> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const updatedAlert = priceAlerts.find((alert) => alert.id === id)
      if (updatedAlert) {
        updatedAlert.status = status
        resolve({ ...updatedAlert })
      } else {
        throw new Error("Alerta no encontrada")
      }
    }, 500)
  })
}

// Función para filtrar facturas
export function filterInvoices({
  month,
  quarter,
  year,
  supplier,
  searchTerm,
}: {
  month?: string
  quarter?: string
  year?: string
  supplier?: string
  searchTerm?: string
}): Invoice[] {
  let filtered = [...invoices]

  if (searchTerm) {
    const term = searchTerm.trim().toLowerCase()
    filtered = filtered.filter(
      (invoice) =>
        invoice.supplier.toLowerCase().includes(term) ||
        invoice.material.toLowerCase().includes(term) ||
        invoice.code.toLowerCase().includes(term),
    )
  }

  if (supplier) {
    filtered = filtered.filter((invoice) => invoice.supplier === supplier)
  }

  if (year) {
    const yearNum = Number.parseInt(year)
    filtered = filtered.filter((invoice) => new Date(invoice.date).getFullYear() === yearNum)
  }

  if (quarter) {
    const quarterNum = Number.parseInt(quarter)
    filtered = filtered.filter((invoice) => {
      const month = new Date(invoice.date).getMonth() + 1
      const invoiceQuarter = Math.ceil(month / 3)
      return invoiceQuarter === quarterNum
    })
  }

  if (month) {
    const monthNum = Number.parseInt(month)
    filtered = filtered.filter((invoice) => new Date(invoice.date).getMonth() + 1 === monthNum)
  }

  return filtered
}

// Función para obtener estadísticas del dashboard
export function getDashboardStats() {
  return {
    totalInvoices: invoices.length,
    totalSuppliers: suppliers.length,
    totalMaterials: materials.length,
    pendingAlerts: priceAlerts.filter((alert) => alert.status === "pending").length,
    recentInvoices: invoices.slice(0, 5),
  }
}
