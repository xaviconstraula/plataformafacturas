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
        }),
        // Hybrid Materials (available from both types of providers)
        prisma.material.create({
            data: {
                code: 'HYB-001',
                name: 'Andamios Metálicos',
                description: 'Andamios modulares para construcción - Venta o Alquiler',
            }
        }),
        prisma.material.create({
            data: {
                code: 'HYB-002',
                name: 'Encofrados Metálicos',
                description: 'Sistema de encofrado modular - Venta o Alquiler',
            }
        }),
        prisma.material.create({
            data: {
                code: 'HYB-003',
                name: 'Puntales Telescópicos',
                description: 'Puntales ajustables de acero - Venta o Alquiler',
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
        // Materiales híbridos
        'HYB-001': 75.00,  // Andamios Metálicos (precio por sección)
        'HYB-002': 95.00,  // Encofrados Metálicos (precio por panel)
        'HYB-003': 25.00,  // Puntales Telescópicos (precio por unidad)
    }

    // Create MaterialProvider relationships with initial prices
    for (const material of materials) {
        for (const provider of providers) {
            const basePrice = basePrices[material.code as keyof typeof basePrices];
            if (!basePrice) { // Safety check in case a material code isn't in basePrices
                console.warn(`Warning: Base price not found for material code ${material.code}. Skipping MaterialProvider creation for this material with provider ${provider.name}.`);
                continue;
            }

            const isEquipment = material.code.startsWith('EQP-');
            const isOriginallyHybrid = material.code.startsWith('HYB-');
            const isCementPortland = material.code === 'MAT-001'; // Specifically Cemento Portland

            // Determine if the material is effectively shareable by all provider types
            const isEffectivelyShareable = isOriginallyHybrid || isCementPortland;

            let shouldCreateLink = false;

            if (isEffectivelyShareable) {
                shouldCreateLink = true; // Shareable materials (original hybrids or Cemento Portland) are linked to all providers
            } else if (isEquipment && provider.type === ProviderType.MACHINERY_RENTAL) {
                shouldCreateLink = true; // Equipment is specific to machinery rental providers
            } else if (!isEquipment && !isOriginallyHybrid && provider.type === ProviderType.MATERIAL_SUPPLIER) {
                // This covers other MAT-xxx materials (not Cemento Portland, not hybrid) for MATERIAL_SUPPLIERs
                shouldCreateLink = true;
            }

            if (shouldCreateLink) {
                // Apply price variation for originally hybrid materials or for Cemento Portland
                const priceVariation = (isOriginallyHybrid || isCementPortland) ? (0.95 + Math.random() * 0.1) : 1; // ±5% variation
                const finalPrice = Number((basePrice * priceVariation).toFixed(2));

                await prisma.materialProvider.create({
                    data: {
                        materialId: material.id,
                        providerId: provider.id,
                        lastPrice: finalPrice
                    }
                });
            }
        }
    }

    // Create Invoices and Invoice Items
    const TODAY = new Date('2025-05-12')
    const startDate = new Date(TODAY)
    startDate.setMonth(startDate.getMonth() - 7) // Start from 8 months ago instead of 6

    for (const provider of providers) {
        // Create 4 invoices per provider instead of 3
        for (let i = 0; i < 4; i++) {
            // Spread invoices across 8 months instead of 6
            const randomMonthOffset = Math.floor(Math.random() * 8)
            const createdAt = new Date(startDate)
            createdAt.setMonth(startDate.getMonth() + randomMonthOffset)

            // Add some randomness to avoid all providers getting invoices in the same months
            const randomDayOffset = Math.floor(Math.random() * 28) // Random day within month
            createdAt.setDate(randomDayOffset + 1)

            const invoice = await prisma.invoice.create({
                data: {
                    invoiceCode: `FAC-${provider.id.slice(-4)}-${String(i + 1).padStart(3, '0')}`,
                    providerId: provider.id,
                    issueDate: createdAt,
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
            const availableMaterials = materials.filter(m => {
                const isHybrid = m.code.startsWith('HYB-');
                const isCementPortland = m.code === 'MAT-001'; // Cemento Portland

                if (provider.type === ProviderType.MACHINERY_RENTAL) {
                    // Machinery rental can offer: Equipment, Hybrid materials, and Cemento Portland
                    return m.code.startsWith('EQP-') || isHybrid || isCementPortland;
                } else if (provider.type === ProviderType.MATERIAL_SUPPLIER) {
                    // Material suppliers can offer: Standard materials (MAT-), Hybrid materials.
                    // MAT- includes Cemento Portland by default as it starts with MAT-.
                    return m.code.startsWith('MAT-') || isHybrid;
                }
                return false; // Should ideally not be reached
            });

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
            if (i === 3) { // Updated from 2 to 3 since we now have 4 invoices
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
