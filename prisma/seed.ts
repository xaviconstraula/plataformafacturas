import { PrismaClient, ProviderType } from '../generated/prisma'

const prisma = new PrismaClient()

// Función para generar fechas aleatorias entre dos fechas
function randomDate(start: Date, end: Date) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

async function main() {
    console.log('🌱 Starting seeding...')

    // Clean up existing data
    await prisma.priceAlert.deleteMany()
    await prisma.invoiceItem.deleteMany()
    await prisma.materialProvider.deleteMany()
    await prisma.invoice.deleteMany()
    await prisma.material.deleteMany()
    await prisma.provider.deleteMany()

    // Create Materials
    const materials = await Promise.all([
        prisma.material.create({
            data: {
                code: 'MAT-001',
                name: 'Cemento Portland',
                description: 'Cemento de alta resistencia',
            }
        }),
        prisma.material.create({
            data: {
                code: 'MAT-002',
                name: 'Varilla de Acero',
                description: 'Varilla corrugada 12mm',
            }
        }),
        prisma.material.create({
            data: {
                code: 'MAT-003',
                name: 'Arena Fina',
                description: 'Arena para construcción',

            }
        }),
        prisma.material.create({
            data: {
                code: 'MAT-004',
                name: 'Ladrillo Cerámico',
                description: 'Ladrillo hueco doble',

            }
        }),
        prisma.material.create({
            data: {
                code: 'MAT-005',
                name: 'Pintura Blanca',
                description: 'Pintura látex interior'
            }
        })
    ])

    // Create Providers
    const providers = await Promise.all([
        prisma.provider.create({
            data: {
                name: 'Materiales Construcción Madrid SL',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'B12345678',
                email: 'contacto@mcmadrid.es',
                phone: '911234567',
                address: 'Calle Gran Vía 123, Madrid'
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Distribuciones Barcelona SA',
                type: ProviderType.DISTRIBUTOR,
                cif: 'A87654321',
                email: 'ventas@distbarcelona.com',
                phone: '934567890',
                address: 'Avenida Diagonal 456, Barcelona'
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Fábrica de Cemento Valencia',
                type: ProviderType.MANUFACTURER,
                cif: 'B98765432',
                email: 'info@cementosvalencia.es',
                phone: '963214567',
                address: 'Polígono Industrial 789, Valencia'
            }
        })
    ])

    // Precios base para materiales (€)
    const basePrices = {
        'MAT-001': 89.99,  // Cemento Portland por kg
        'MAT-002': 15.50,  // Varilla de Acero por unidad
        'MAT-003': 45.75,  // Arena Fina por m³
        'MAT-004': 0.85,   // Ladrillo Cerámico por unidad
        'MAT-005': 24.99   // Pintura Blanca por litro
    }

    // Create MaterialProvider relationships with initial prices
    for (const material of materials) {
        for (const provider of providers) {
            const basePrice = basePrices[material.code as keyof typeof basePrices]
            // Cada proveedor tiene un margen diferente
            const margin = provider.type === ProviderType.MANUFACTURER ? 1.0 :
                provider.type === ProviderType.DISTRIBUTOR ? 1.15 : 1.25

            await prisma.materialProvider.create({
                data: {
                    materialId: material.id,
                    providerId: provider.id,
                    lastPrice: Number((basePrice * margin).toFixed(2))
                }
            })
        }
    }

    // Create Invoices and Invoice Items
    const TODAY = new Date('2025-05-12')
    const startDate = new Date(TODAY)
    startDate.setMonth(startDate.getMonth() - 5) // Start from 6 months ago (December 2024)

    for (const provider of providers) {
        for (let i = 0; i < 5; i++) {
            const randomMonthOffset = Math.floor(Math.random() * 6) // Random month between 0-5 months ago
            const createdAt = new Date(startDate)
            createdAt.setMonth(startDate.getMonth() + randomMonthOffset)

            const invoice = await prisma.invoice.create({
                data: {
                    invoiceCode: `FAC-${provider.id.slice(-4)}-${String(i + 1).padStart(3, '0')}`,
                    providerId: provider.id,
                    issueDate: randomDate(new Date('2024-12-01'), TODAY), // More recent issue dates
                    totalAmount: 0, // Will be updated after adding items
                    status: 'PROCESSED',
                    pdfUrl: `https://storage.example.com/invoices/invoice-${provider.id}-${i + 1}.pdf`,
                    createdAt // Set the createdAt date explicitly
                }
            })

            // Add 2-3 items to each invoice
            const itemCount = 2 + (i % 2) // Alternates between 2 and 3 items
            let totalAmount = 0

            for (let j = 0; j < itemCount; j++) {
                const material = materials[j % materials.length]
                const basePrice = basePrices[material.code as keyof typeof basePrices]
                const margin = provider.type === ProviderType.MANUFACTURER ? 1.0 :
                    provider.type === ProviderType.DISTRIBUTOR ? 1.15 : 1.25
                const quantity = 10 + (j * 5) // 10, 15, 20...
                const price = Number((basePrice * margin).toFixed(2))
                const totalPrice = Number((quantity * price).toFixed(2))

                await prisma.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        materialId: material.id,
                        quantity,
                        unitPrice: price,
                        totalPrice
                    }
                })

                totalAmount += totalPrice
            }

            // Update invoice total amount
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { totalAmount: Number(totalAmount.toFixed(2)) }
            })

            // Create price alerts for significant increases (20% increase)
            if (i === 4) { // Solo para la última factura de cada proveedor
                const material = materials[0] // Alerta para el Cemento Portland
                const oldPrice = basePrices['MAT-001']
                const newPrice = oldPrice * 1.20 // 20% increase

                await prisma.priceAlert.create({
                    data: {
                        materialId: material.id,
                        providerId: provider.id,
                        oldPrice,
                        newPrice,
                        percentage: 20.00,
                        status: 'PENDING'
                    }
                })
            }
        }
    }

    console.log('✅ Seeding completed successfully')
}

main()
    .catch((e) => {
        console.error('❌ Error during seeding:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
