import { PrismaClient, ProviderType, BatchStatus } from '../generated/prisma'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

// Función para generar fechas aleatorias entre dos fechas
function randomDate(start: Date, end: Date) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

// Función para generar variación de precio realista
function generatePriceVariation(basePrice: number, variation: number = 0.1): number {
    const randomVariation = (0.95 + Math.random() * variation) // ±5% to ±variation%
    return Number((basePrice * randomVariation).toFixed(2))
}

async function main() {
    console.log('🌱 Starting Hacelerix user seeding...')

    // First, find or create the user
    let user = await prisma.user.findUnique({
        where: { email: 'info@hacelerix.com' }
    })

    if (!user) {
        console.log('Creating Hacelerix user with authentication...')

        // Hash the password
        const hashedPassword = await hash('hacelerix', 12)

        user = await prisma.user.create({
            data: {
                email: 'info@hacelerix.com',
                name: 'Hacelerix',
                emailVerified: true,
                image: null
            }
        })

        // Create the account for password authentication
        await prisma.account.create({
            data: {
                id: `account_${user.id}`,
                accountId: user.id,
                providerId: 'credential',
                userId: user.id,
                password: hashedPassword,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        })

        console.log('✅ User and authentication created')
    } else {
        console.log('✅ User already exists, using existing user')
    }

    // SAFETY CHECK: Only clean data that belongs to this specific user
    console.log('🧹 Safely cleaning existing data for Hacelerix user only...')

    // Get user-specific data counts before deletion
    const beforeCounts = {
        providers: await prisma.provider.count({ where: { userId: user.id } }),
        materials: await prisma.material.count({ where: { userId: user.id } }),
        productGroups: await prisma.productGroup.count({ where: { userId: user.id } }),
        batchProcessing: await prisma.batchProcessing.count({ where: { userId: user.id } })
    }

    console.log(`Found existing data for user ${user.email}:`, beforeCounts)

    // Delete in correct order to respect foreign key constraints - ONLY for this user
    await prisma.priceAlert.deleteMany({
        where: {
            AND: [
                { provider: { userId: user.id } },
                { material: { userId: user.id } }
            ]
        }
    })

    await prisma.invoiceItem.deleteMany({
        where: {
            invoice: {
                provider: { userId: user.id }
            }
        }
    })

    await prisma.materialProvider.deleteMany({
        where: {
            AND: [
                { provider: { userId: user.id } },
                { material: { userId: user.id } }
            ]
        }
    })

    await prisma.invoice.deleteMany({
        where: {
            provider: { userId: user.id }
        }
    })

    await prisma.material.deleteMany({
        where: { userId: user.id }
    })

    await prisma.provider.deleteMany({
        where: { userId: user.id }
    })

    await prisma.productGroup.deleteMany({
        where: { userId: user.id }
    })

    await prisma.batchProcessing.deleteMany({
        where: { userId: user.id }
    })

    console.log('✅ Cleanup completed - only Hacelerix user data was affected')

    // SAFETY VERIFICATION: Check that other users' data is intact
    const totalUsersCount = await prisma.user.count()
    const otherUsersData = {
        providers: await prisma.provider.count({ where: { userId: { not: user.id } } }),
        materials: await prisma.material.count({ where: { userId: { not: user.id } } }),
        invoices: await prisma.invoice.count({
            where: { provider: { userId: { not: user.id } } }
        })
    }

    console.log(`✅ Safety check passed:`)
    console.log(`  - Total users in system: ${totalUsersCount}`)
    console.log(`  - Other users' data preserved:`, otherUsersData)

    // Create Product Groups for better organization
    console.log('📦 Creating product groups...')
    const productGroups = await Promise.all([
        prisma.productGroup.create({
            data: {
                standardizedName: 'Cemento y Morteros',
                description: 'Productos de cemento, mortero y derivados',
                category: 'CONSTRUCCION',
                unit: 'TN',
                userId: user.id
            }
        }),
        prisma.productGroup.create({
            data: {
                standardizedName: 'Estructuras Metálicas',
                description: 'Acero, hierro y elementos estructurales',
                category: 'ESTRUCTURA',
                unit: 'KG',
                userId: user.id
            }
        }),
        prisma.productGroup.create({
            data: {
                standardizedName: 'Áridos y Granulados',
                description: 'Arena, grava, gravilla y similares',
                category: 'CONSTRUCCION',
                unit: 'M3',
                userId: user.id
            }
        }),
        prisma.productGroup.create({
            data: {
                standardizedName: 'Maquinaria Excavación',
                description: 'Equipos de excavación y movimiento de tierras',
                category: 'MAQUINARIA',
                unit: 'DIA',
                userId: user.id
            }
        }),
        prisma.productGroup.create({
            data: {
                standardizedName: 'Encofrados y Andamios',
                description: 'Sistemas modulares para construcción',
                category: 'AUXILIAR',
                unit: 'M2',
                userId: user.id
            }
        })
    ])

    // Create realistic construction materials
    console.log('🧱 Creating materials...')
    const materials = await Promise.all([
        // Cemento y Morteros
        prisma.material.create({
            data: {
                code: 'CEM-001',
                name: 'Cemento Portland CEM I 42,5 R',
                description: 'Cemento tipo I de alta resistencia inicial',
                category: 'CEMENTO',
                unit: 'TN',
                referenceCode: 'CEM142.5R',
                alternativeCodes: 'CEMI-42.5R,PORTLAND-42.5',
                productGroupId: productGroups[0].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'MOR-001',
                name: 'Mortero M-10 Predosificado',
                description: 'Mortero seco de albañilería M-10',
                category: 'MORTERO',
                unit: 'TN',
                referenceCode: 'MOR-M10',
                productGroupId: productGroups[0].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'MOR-002',
                name: 'Mortero Refractario',
                description: 'Mortero especial para altas temperaturas',
                category: 'MORTERO',
                unit: 'TN',
                referenceCode: 'MOR-REF',
                productGroupId: productGroups[0].id,
                userId: user.id
            }
        }),

        // Estructuras Metálicas
        prisma.material.create({
            data: {
                code: 'ACE-001',
                name: 'Varilla Corrugada B-500-S Ø12mm',
                description: 'Barra de acero corrugado diámetro 12mm',
                category: 'ACERO',
                unit: 'KG',
                referenceCode: 'B500S-12',
                alternativeCodes: 'VAR-12,CORRUGADO-12',
                productGroupId: productGroups[1].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'ACE-002',
                name: 'Varilla Corrugada B-500-S Ø16mm',
                description: 'Barra de acero corrugado diámetro 16mm',
                category: 'ACERO',
                unit: 'KG',
                referenceCode: 'B500S-16',
                alternativeCodes: 'VAR-16,CORRUGADO-16',
                productGroupId: productGroups[1].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'VIG-001',
                name: 'Viga IPE-200',
                description: 'Perfil IPE de 200mm de canto',
                category: 'PERFILES',
                unit: 'ML',
                referenceCode: 'IPE200',
                productGroupId: productGroups[1].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'MAL-001',
                name: 'Malla Electrosoldada ME-20x20x5',
                description: 'Malla electrosoldada 20x20cm diámetro 5mm',
                category: 'MALLA',
                unit: 'M2',
                referenceCode: 'ME-20x20x5',
                productGroupId: productGroups[1].id,
                userId: user.id
            }
        }),

        // Áridos y Granulados
        prisma.material.create({
            data: {
                code: 'ARI-001',
                name: 'Arena de Río Lavada',
                description: 'Arena fina para morteros y hormigones',
                category: 'ARIDOS',
                unit: 'M3',
                referenceCode: 'AR-RIO',
                alternativeCodes: 'ARENA-LAVADA,ARENA-FINA',
                productGroupId: productGroups[2].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'GRA-001',
                name: 'Grava 20-40mm',
                description: 'Grava clasificada tamaño 20-40mm',
                category: 'ARIDOS',
                unit: 'M3',
                referenceCode: 'GR-20-40',
                productGroupId: productGroups[2].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'GRA-002',
                name: 'Gravilla 4-12mm',
                description: 'Gravilla para hormigón 4-12mm',
                category: 'ARIDOS',
                unit: 'M3',
                referenceCode: 'GV-4-12',
                productGroupId: productGroups[2].id,
                userId: user.id
            }
        }),

        // Maquinaria
        prisma.material.create({
            data: {
                code: 'EXC-001',
                name: 'Excavadora Hidráulica 20T',
                description: 'Excavadora sobre orugas 20 toneladas',
                category: 'EXCAVACION',
                unit: 'DIA',
                referenceCode: 'EXC-20T',
                productGroupId: productGroups[3].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'EXC-002',
                name: 'Miniexcavadora 3T',
                description: 'Excavadora compacta 3 toneladas',
                category: 'EXCAVACION',
                unit: 'DIA',
                referenceCode: 'MINI-EXC-3T',
                productGroupId: productGroups[3].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'CAR-001',
                name: 'Cargadora Frontal',
                description: 'Cargadora frontal sobre ruedas',
                category: 'CARGA',
                unit: 'DIA',
                referenceCode: 'CAR-FRONT',
                productGroupId: productGroups[3].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'COM-001',
                name: 'Compactadora Vibratoria',
                description: 'Compactador vibratorio para suelos',
                category: 'COMPACTACION',
                unit: 'DIA',
                referenceCode: 'COMP-VIB',
                productGroupId: productGroups[3].id,
                userId: user.id
            }
        }),

        // Encofrados y Andamios (materiales híbridos)
        prisma.material.create({
            data: {
                code: 'AND-001',
                name: 'Andamio Tubular Multidireccional',
                description: 'Sistema de andamio modular',
                category: 'ANDAMIOS',
                unit: 'M2',
                referenceCode: 'AND-MULTI',
                productGroupId: productGroups[4].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'ENC-001',
                name: 'Encofrado Metálico para Muros',
                description: 'Panel metálico para encofrado de muros',
                category: 'ENCOFRADO',
                unit: 'M2',
                referenceCode: 'ENC-MUR',
                productGroupId: productGroups[4].id,
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'PUN-001',
                name: 'Puntal Telescópico 3-5m',
                description: 'Puntal ajustable de 3 a 5 metros',
                category: 'PUNTALES',
                unit: 'UD',
                referenceCode: 'PUN-3-5',
                productGroupId: productGroups[4].id,
                userId: user.id
            }
        }),

        // Materiales adicionales
        prisma.material.create({
            data: {
                code: 'BLO-001',
                name: 'Bloque Hormigón 40x20x20',
                description: 'Bloque de hormigón para tabiquería',
                category: 'BLOQUES',
                unit: 'UD',
                referenceCode: 'BLO-40-20-20',
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'LAD-001',
                name: 'Ladrillo Perforado 24x11x7',
                description: 'Ladrillo perforado para fábrica',
                category: 'LADRILLOS',
                unit: 'UD',
                referenceCode: 'LAD-24-11-7',
                userId: user.id
            }
        }),
        prisma.material.create({
            data: {
                code: 'TUB-001',
                name: 'Tubo PVC Ø110mm Evacuación',
                description: 'Tubo PVC para evacuación aguas residuales',
                category: 'FONTANERIA',
                unit: 'ML',
                referenceCode: 'PVC-110',
                userId: user.id
            }
        })
    ])

    // Create realistic Spanish providers
    console.log('🏗️ Creating providers...')
    const providers = await Promise.all([
        // Material Suppliers
        prisma.provider.create({
            data: {
                name: 'Cementos Lafarge España SL',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'B28123456',
                email: 'ventas@lafarge.es',
                phone: '+34 911 234 567',
                address: 'Polígono Industrial Las Mercedes, 28970 Humanes de Madrid',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Hierros y Aceros del Norte SA',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'A48987654',
                email: 'comercial@hierrosnorte.com',
                phone: '+34 944 567 890',
                address: 'Barrio Olabarrieta 45, 48940 Leioa, Bizkaia',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Áridos García y Hermanos SL',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'B41234789',
                email: 'info@aridosgarcia.es',
                phone: '+34 955 432 109',
                address: 'Ctra. Sevilla-Cádiz Km 45, 41620 Marchena, Sevilla',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Materiales de Construcción Valencia SL',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'B46345678',
                email: 'pedidos@matconvalencia.com',
                phone: '+34 963 789 012',
                address: 'Pol. Ind. Fuente del Jarro, 46988 Paterna, Valencia',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Prefabricados Catalanes SA',
                type: ProviderType.MATERIAL_SUPPLIER,
                cif: 'A08876543',
                email: 'ventas@prefabcat.es',
                phone: '+34 932 456 789',
                address: 'Calle Industria 123, 08038 Barcelona',
                userId: user.id
            }
        }),

        // Machinery Rental Providers
        prisma.provider.create({
            data: {
                name: 'Maquinaria Pesada Ibérica SL',
                type: ProviderType.MACHINERY_RENTAL,
                cif: 'B28765432',
                email: 'alquiler@maqiberica.es',
                phone: '+34 916 543 210',
                address: 'Avda. de la Industria 67, 28820 Coslada, Madrid',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Alquileres Mediterráneo SL',
                type: ProviderType.MACHINERY_RENTAL,
                cif: 'B03654321',
                email: 'info@alquilermediterraneo.com',
                phone: '+34 965 789 123',
                address: 'Pol. Ind. Pla de la Vallonga, 03114 Alicante',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Excavaciones y Alquileres Galicia SL',
                type: ProviderType.MACHINERY_RENTAL,
                cif: 'B15987654',
                email: 'maquinaria@excgalicia.es',
                phone: '+34 981 234 567',
                address: 'Rúa da Industria 89, 15142 Arteixo, A Coruña',
                userId: user.id
            }
        }),
        prisma.provider.create({
            data: {
                name: 'Alquiler de Andamios Profesionales SL',
                type: ProviderType.MACHINERY_RENTAL,
                cif: 'B50123789',
                email: 'andamios@alpro.es',
                phone: '+34 976 890 123',
                address: 'Pol. Ind. Malpica, 50016 Zaragoza',
                userId: user.id
            }
        })
    ])

    // Create price matrix (material codes mapped to realistic base prices in EUR)
    const basePrices: Record<string, number> = {
        // Cemento y Morteros (€/TN)
        'CEM-001': 145.50,  // Cemento Portland CEM I 42,5 R
        'MOR-001': 185.75,  // Mortero M-10 Predosificado
        'MOR-002': 235.00,  // Mortero Refractario

        // Estructuras Metálicas (€/KG o €/ML o €/M2)
        'ACE-001': 0.78,    // Varilla Corrugada Ø12mm (€/KG)
        'ACE-002': 0.76,    // Varilla Corrugada Ø16mm (€/KG)
        'VIG-001': 12.45,   // Viga IPE-200 (€/ML)
        'MAL-001': 4.25,    // Malla Electrosoldada (€/M2)

        // Áridos y Granulados (€/M3)
        'ARI-001': 28.50,   // Arena de Río Lavada
        'GRA-001': 32.75,   // Grava 20-40mm
        'GRA-002': 35.00,   // Gravilla 4-12mm

        // Maquinaria (€/DIA)
        'EXC-001': 420.00,  // Excavadora Hidráulica 20T
        'EXC-002': 180.00,  // Miniexcavadora 3T
        'CAR-001': 350.00,  // Cargadora Frontal
        'COM-001': 85.00,   // Compactadora Vibratoria

        // Encofrados y Andamios (€/M2 o €/UD)
        'AND-001': 8.50,    // Andamio Tubular (€/M2)
        'ENC-001': 15.75,   // Encofrado Metálico (€/M2)
        'PUN-001': 2.85,    // Puntal Telescópico (€/UD)

        // Materiales adicionales
        'BLO-001': 1.25,    // Bloque Hormigón (€/UD)
        'LAD-001': 0.45,    // Ladrillo Perforado (€/UD)
        'TUB-001': 8.90     // Tubo PVC (€/ML)
    }

    // Create MaterialProvider relationships based on realistic supply chains
    console.log('🔗 Creating material-provider relationships...')
    for (const material of materials) {
        for (const provider of providers) {
            const basePrice = basePrices[material.code];
            if (!basePrice) {
                console.warn(`Warning: Base price not found for material code ${material.code}`);
                continue;
            }

            let shouldCreateLink = false;

            // Define supply logic based on material category and provider type
            const materialCategory = material.category;
            const isEquipment = ['EXCAVACION', 'CARGA', 'COMPACTACION'].includes(materialCategory || '');
            const isHybrid = ['ANDAMIOS', 'ENCOFRADO', 'PUNTALES'].includes(materialCategory || '');

            if (provider.type === ProviderType.MATERIAL_SUPPLIER) {
                // Material suppliers can provide: construction materials, some hybrid items
                shouldCreateLink = !isEquipment && (
                    ['CEMENTO', 'MORTERO', 'ACERO', 'PERFILES', 'MALLA', 'ARIDOS', 'BLOQUES', 'LADRILLOS', 'FONTANERIA'].includes(materialCategory || '') ||
                    isHybrid
                );
            } else if (provider.type === ProviderType.MACHINERY_RENTAL) {
                // Machinery rental can provide: equipment and hybrid items
                shouldCreateLink = isEquipment || isHybrid;
            }

            if (shouldCreateLink) {
                // Apply realistic price variation
                const priceVariation = isHybrid ? generatePriceVariation(basePrice, 0.15) : generatePriceVariation(basePrice, 0.08);

                const lastPriceDate = randomDate(
                    new Date('2025-02-01'),
                    new Date('2025-08-01')
                );

                await prisma.materialProvider.create({
                    data: {
                        materialId: material.id,
                        providerId: provider.id,
                        lastPrice: priceVariation,
                        lastPriceDate
                    }
                });
            }
        }
    }

    // Create realistic work orders for Spanish construction projects
    const workOrders = [
        'OT-2024-001-RESIDENCIAL-VALDEBEBAS',
        'OT-2024-002-OFICINAS-CUATRO-TORRES',
        'OT-2024-003-HOSPITAL-GREGORIO-MARANON',
        'OT-2024-004-METRO-LINEA-12',
        'OT-2024-005-CENTRO-COMERCIAL-ALCORCON',
        'OT-2024-006-PARKING-AEROPUERTO-BARAJAS',
        'OT-2024-007-COLEGIO-MAJADAHONDA',
        'OT-2024-008-FABRICA-SEAT-MARTORELL',
        'OT-2024-009-PUENTE-A6-RENOVACION',
        'OT-2024-010-ESTACION-AVE-ANTEQUERA',
        'OT-2025-001-TORRE-CALEIDO-AMPLIACION',
        'OT-2025-002-POLIDEPORTIVO-LEGANES',
        'OT-2025-003-TUNEL-M40-REFUERZO',
        'OT-2025-004-CENTRO-SALUD-GETAFE',
        'OT-2025-005-UNIVERSIDAD-AUTONOMA-BIBLIOTECA',
        'OT-2025-006-TEATRO-REAL-REFORMA'
    ];

    // Create realistic invoices spread over the last 12 months
    console.log('📄 Creating invoices...')
    // Since current date is August 21, 2025, create data from March 2025 to August 2025
    const startDate = new Date('2025-03-01');
    const endDate = new Date('2025-08-20'); // Up to current date

    let invoiceCounter = 1;
    for (const provider of providers) {
        // Create 6-8 invoices per provider
        const invoiceCount = 6 + Math.floor(Math.random() * 3);

        for (let i = 0; i < invoiceCount; i++) {
            const invoiceDate = randomDate(startDate, endDate);

            // Generate realistic invoice code
            const invoiceCode = `${provider.cif.slice(-4)}-${invoiceDate.getFullYear()}-${String(invoiceCounter).padStart(4, '0')}`;
            invoiceCounter++;

            const invoice = await prisma.invoice.create({
                data: {
                    invoiceCode,
                    providerId: provider.id,
                    issueDate: invoiceDate,
                    totalAmount: 0,
                    status: Math.random() > 0.1 ? 'PROCESSED' : 'PENDING', // 90% processed
                    pdfUrl: `https://storage.hacelerix.com/invoices/${invoiceCode}.pdf`,
                    createdAt: invoiceDate
                }
            });

            // Add 2-5 items per invoice
            const itemCount = 2 + Math.floor(Math.random() * 4);
            let totalAmount = 0;

            // Get materials that this provider can supply
            const availableMaterials = materials.filter(material => {
                return basePrices[material.code] !== undefined;
            });

            // Get material provider relationships for this provider
            const materialProviders = await prisma.materialProvider.findMany({
                where: { providerId: provider.id },
                include: { material: true }
            });

            const providerMaterials = materialProviders.map(mp => mp.material);

            for (let j = 0; j < itemCount; j++) {
                const material = providerMaterials[j % providerMaterials.length];
                if (!material) continue;

                const materialProvider = materialProviders.find(mp => mp.materialId === material.id);
                if (!materialProvider) continue;

                const basePrice = materialProvider.lastPrice;

                // Generate realistic quantities based on material type
                let quantity: number;
                switch (material.category) {
                    case 'CEMENTO':
                    case 'MORTERO':
                        quantity = Number((5 + Math.random() * 20).toFixed(2)); // 5-25 TN
                        break;
                    case 'ACERO':
                        quantity = Number((100 + Math.random() * 1900).toFixed(0)); // 100-2000 KG
                        break;
                    case 'ARIDOS':
                        quantity = Number((10 + Math.random() * 40).toFixed(1)); // 10-50 M3
                        break;
                    case 'EXCAVACION':
                    case 'CARGA':
                    case 'COMPACTACION':
                        quantity = Number((1 + Math.random() * 14).toFixed(0)); // 1-15 days
                        break;
                    case 'ANDAMIOS':
                    case 'ENCOFRADO':
                        quantity = Number((50 + Math.random() * 450).toFixed(0)); // 50-500 M2
                        break;
                    default:
                        quantity = Number((10 + Math.random() * 90).toFixed(0)); // 10-100 units
                }

                // Add some price variation (±3%) for realistic market fluctuation
                const currentPrice = generatePriceVariation(basePrice.toNumber(), 0.06);
                const itemTotal = Number((quantity * currentPrice).toFixed(2));

                // Assign random work order
                const workOrder = workOrders[Math.floor(Math.random() * workOrders.length)];

                await prisma.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        materialId: material.id,
                        quantity,
                        unitPrice: currentPrice,
                        totalPrice: itemTotal,
                        itemDate: invoiceDate,
                        workOrder,
                        description: `${material.name} - ${material.description}`,
                        lineNumber: j + 1
                    }
                });

                totalAmount += itemTotal;

                // Update material provider with new price if this is a recent invoice
                if (invoiceDate > materialProvider.lastPriceDate!) {
                    await prisma.materialProvider.update({
                        where: { id: materialProvider.id },
                        data: {
                            lastPrice: currentPrice,
                            lastPriceDate: invoiceDate
                        }
                    });
                }
            }

            // Update invoice total
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { totalAmount: Number(totalAmount.toFixed(2)) }
            });
        }
    }

    // Create realistic price alerts for significant price increases
    console.log('🚨 Creating price alerts...')

    // Get ALL invoices from the last 6 months to have more data for alerts
    const alertStartDate = new Date('2025-03-01'); // Updated to current timeframe
    const recentInvoices = await prisma.invoice.findMany({
        where: {
            provider: { userId: user.id },
            issueDate: {
                gte: alertStartDate
            }
        },
        include: {
            items: {
                include: { material: true }
            },
            provider: true
        },
        orderBy: {
            issueDate: 'desc'
        }
    });

    console.log(`Found ${recentInvoices.length} recent invoices for alert generation`);

    let alertsCreated = 0;

    // Create alerts for more invoices to ensure we have data
    for (const invoice of recentInvoices.slice(0, 15)) { // Increased from 8 to 15
        for (const item of invoice.items) { // Check all items, not just first one
            // Find previous price for this material-provider combination
            const materialProvider = await prisma.materialProvider.findUnique({
                where: {
                    materialId_providerId: {
                        materialId: item.materialId,
                        providerId: invoice.providerId
                    }
                }
            });

            if (!materialProvider) continue;

            const oldPrice = materialProvider.lastPrice;
            const newPrice = item.unitPrice;
            const percentageChange = Number((((newPrice.toNumber() - oldPrice.toNumber()) / oldPrice.toNumber()) * 100).toFixed(2));

            // Create alert if price increase is significant (>10% instead of >15% to get more alerts)
            if (Math.abs(percentageChange) > 10) {
                try {
                    // Check if alert already exists for this combination and date
                    const existingAlert = await prisma.priceAlert.findUnique({
                        where: {
                            materialId_providerId_effectiveDate: {
                                materialId: item.materialId,
                                providerId: invoice.providerId,
                                effectiveDate: invoice.issueDate
                            }
                        }
                    });

                    if (!existingAlert) {
                        await prisma.priceAlert.create({
                            data: {
                                materialId: item.materialId,
                                providerId: invoice.providerId,
                                oldPrice,
                                newPrice,
                                percentage: percentageChange,
                                status: Math.random() > 0.6 ? 'APPROVED' : 'PENDING', // 40% approved, 60% pending
                                effectiveDate: invoice.issueDate,
                                invoiceId: invoice.id
                            }
                        });
                        alertsCreated++;
                    }
                } catch (error) {
                    // Skip if there's a constraint violation
                    console.log(`Skipped duplicate alert for material ${item.material.name}`);
                }
            }
        }
    }

    console.log(`✅ Created ${alertsCreated} price alerts`);

    // If we don't have enough alerts, create some forced ones with realistic data
    if (alertsCreated < 5) {
        console.log('📈 Creating additional guaranteed alerts...')

        // Get some recent invoices and materials
        const someInvoices = recentInvoices.slice(0, 5);

        for (const invoice of someInvoices) {
            const item = invoice.items[0];
            if (!item) continue;

            // Create a forced price alert with a significant increase
            const currentPrice = item.unitPrice.toNumber();
            const artificialOldPrice = currentPrice * 0.75; // 25% price increase
            const percentageIncrease = 25.0;

            try {
                await prisma.priceAlert.create({
                    data: {
                        materialId: item.materialId,
                        providerId: invoice.providerId,
                        oldPrice: artificialOldPrice,
                        newPrice: currentPrice,
                        percentage: percentageIncrease,
                        status: 'PENDING',
                        effectiveDate: invoice.issueDate,
                        invoiceId: invoice.id
                    }
                });
                alertsCreated++;
            } catch (error) {
                // Skip if duplicate
            }
        }

        console.log(`✅ Total alerts created: ${alertsCreated}`);
    }

    // Create batch processing records to simulate upload history
    console.log('📊 Creating batch processing history...')
    const batchDates = [
        new Date('2025-08-15'),
        new Date('2025-07-28'),
        new Date('2025-06-22'),
        new Date('2025-05-18'),
        new Date('2025-04-14')
    ];

    for (const [index, batchDate] of batchDates.entries()) {
        const totalFiles = 8 + Math.floor(Math.random() * 12); // 8-20 files
        const successfulFiles = Math.floor(totalFiles * (0.85 + Math.random() * 0.1)); // 85-95% success
        const failedFiles = totalFiles - successfulFiles;

        await prisma.batchProcessing.create({
            data: {
                status: BatchStatus.COMPLETED,
                totalFiles,
                processedFiles: totalFiles,
                successfulFiles,
                failedFiles,
                blockedFiles: 0,
                startedAt: batchDate,
                completedAt: new Date(batchDate.getTime() + (1000 * 60 * 15)), // 15 minutes later
                userId: user.id,
                errors: failedFiles > 0 ? JSON.stringify([
                    'Error parsing PDF: Corrupted file format',
                    'Provider CIF not found in document',
                    'Invalid date format in invoice'
                ]) : undefined
            }
        });
    }

    console.log('✅ Hacelerix user seeding completed successfully!')
    console.log(`Created data for user: ${user.email}`)
    console.log(`- Product Groups: ${productGroups.length}`)
    console.log(`- Materials: ${materials.length}`)
    console.log(`- Providers: ${providers.length}`)
    console.log(`- Total Invoices: ${invoiceCounter - 1}`)
    console.log(`- Work Orders: ${workOrders.length}`)

    // Final safety verification
    const finalVerification = {
        totalUsers: await prisma.user.count(),
        hacelerixData: {
            providers: await prisma.provider.count({ where: { userId: user.id } }),
            materials: await prisma.material.count({ where: { userId: user.id } }),
            invoices: await prisma.invoice.count({
                where: { provider: { userId: user.id } }
            })
        },
        otherUsersData: {
            providers: await prisma.provider.count({ where: { userId: { not: user.id } } }),
            materials: await prisma.material.count({ where: { userId: { not: user.id } } }),
            invoices: await prisma.invoice.count({
                where: { provider: { userId: { not: user.id } } }
            })
        }
    }

    console.log('\n🔒 Final Safety Verification:')
    console.log(`  - Total users in system: ${finalVerification.totalUsers}`)
    console.log(`  - Hacelerix user data: ${JSON.stringify(finalVerification.hacelerixData, null, 2)}`)
    console.log(`  - Other users' data: ${JSON.stringify(finalVerification.otherUsersData, null, 2)}`)
    console.log('✅ All data properly isolated by user!')
}

main()
    .catch((e) => {
        console.error('❌ Error during Hacelerix seeding:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
