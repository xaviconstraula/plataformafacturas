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

    // Create Materials and Equipment
    const materials = await Promise.all([
        // Construction Materials
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
        // Equipment for Rental
        prisma.material.create({
            data: {
                code: 'EQP-001',
                name: 'Excavadora Compacta',
                description: 'Excavadora 2T para obras menores',
            }
        }),
        prisma.material.create({
            data: {
                code: 'EQP-002',
                name: 'Montacargas Eléctrico',
                description: 'Montacargas 1000kg capacidad',
            }
        })
    ])

    // Create Providers
    const providers = await Promise.all([
        // Material Suppliers
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
                name: 'Suministros Construcción Barcelona SA',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'A87654321',
                email: 'ventas@suministrosbcn.com',
                phone: '934567890',
                address: 'Avenida Diagonal 456, Barcelona'
            }
        }),
        // Machinery Rental Providers
        prisma.provider.create({
            data: {
                name: 'Alquiler Maquinaria Valencia SL',
                type: ProviderType.MACHINERY_RENTAL,
                cif: 'B98765432',
                email: 'info@maquinariavlc.es',
                phone: '963214567',
                address: 'Polígono Industrial 789, Valencia'
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Maquinaria Pesada Madrid',
                type: ProviderType.MACHINERY_RENTAL,
                cif: 'B76543210',
                email: 'alquileres@maquinamad.es',
                phone: '912345678',
                address: 'Calle Industria 321, Madrid'
            }
        })
    ])

    // Precios base (€)
    const basePrices = {
        // Materiales de construcción
        'MAT-001': 89.99,  // Cemento Portland por tonelada
        'MAT-002': 15.50,  // Varilla de Acero por unidad
        'MAT-003': 45.75,  // Arena Fina por m³
        // Maquinaria (precio por día)
        'EQP-001': 150.00, // Excavadora Compacta
        'EQP-002': 85.00,  // Montacargas
    }

    // Create MaterialProvider relationships with initial prices
    for (const material of materials) {
        for (const provider of providers) {
            const basePrice = basePrices[material.code as keyof typeof basePrices]
            const isEquipment = material.code.startsWith('EQP-')

            // Solo crear relaciones apropiadas según el tipo de proveedor
            if ((isEquipment && provider.type === ProviderType.MACHINERY_RENTAL) ||
                (!isEquipment && provider.type === ProviderType.MATERIAL_SUPPLIER)) {
                await prisma.materialProvider.create({
                    data: {
                        materialId: material.id,
                        providerId: provider.id,
                        lastPrice: Number(basePrice.toFixed(2))
                    }
                })
            }
        }
    }

    // Create Invoices and Invoice Items
    const TODAY = new Date('2025-05-12')
    const startDate = new Date(TODAY)
    startDate.setMonth(startDate.getMonth() - 5) // Start from 6 months ago

    for (const provider of providers) {
        for (let i = 0; i < 5; i++) {
            const randomMonthOffset = Math.floor(Math.random() * 6)
            const createdAt = new Date(startDate)
            createdAt.setMonth(startDate.getMonth() + randomMonthOffset)

            const invoice = await prisma.invoice.create({
                data: {
                    invoiceCode: `FAC-${provider.id.slice(-4)}-${String(i + 1).padStart(3, '0')}`,
                    providerId: provider.id,
                    issueDate: randomDate(new Date('2024-12-01'), TODAY),
                    totalAmount: 0,
                    status: 'PROCESSED',
                    pdfUrl: `https://storage.example.com/invoices/invoice-${provider.id}-${i + 1}.pdf`,
                    createdAt
                }
            })

            // Add 2-3 items to each invoice
            const itemCount = 2 + (i % 2)
            let totalAmount = 0

            // Filter materials based on provider type
            const availableMaterials = materials.filter(m =>
                (provider.type === ProviderType.MACHINERY_RENTAL && m.code.startsWith('EQP-')) ||
                (provider.type === ProviderType.MATERIAL_SUPPLIER && m.code.startsWith('MAT-'))
            )

            for (let j = 0; j < itemCount; j++) {
                const material = availableMaterials[j % availableMaterials.length]
                const basePrice = basePrices[material.code as keyof typeof basePrices]
                const quantity = material.code.startsWith('EQP-') ?
                    1 + Math.floor(Math.random() * 5) : // 1-5 días de alquiler
                    10 + (j * 5) // 10, 15, 20 unidades para materiales
                const totalPrice = Number((quantity * basePrice).toFixed(2))

                await prisma.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        materialId: material.id,
                        quantity,
                        unitPrice: basePrice,
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
            if (i === 4) {
                const material = availableMaterials[0]
                const basePrice = basePrices[material.code as keyof typeof basePrices]
                const newPrice = basePrice * 1.20

                await prisma.priceAlert.create({
                    data: {
                        materialId: material.id,
                        providerId: provider.id,
                        oldPrice: basePrice,
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
