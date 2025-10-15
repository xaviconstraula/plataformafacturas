import { PrismaClient } from '../generated/prisma'
import { auth } from '@/auth'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting seeding...')

    // CLEAN SLATE: Delete ALL existing data before seeding
    console.log('🧹 Cleaning ALL existing data for fresh seeding...')

    // Get total counts before deletion
    const beforeCounts = {
        users: await prisma.user.count(),
        providers: await prisma.provider.count(),
        materials: await prisma.material.count(),
        productGroups: await prisma.productGroup.count(),
        batchProcessing: await prisma.batchProcessing.count(),
        sessions: await prisma.session.count(),
        accounts: await prisma.account.count(),
        verifications: await prisma.verification.count()
    }

    console.log('Existing data counts:', beforeCounts)

    // Delete in correct order to respect foreign key constraints - ALL DATA
    console.log('Deleting data in proper order...')

    await prisma.priceAlert.deleteMany()
    await prisma.invoiceItem.deleteMany()
    await prisma.materialProvider.deleteMany()
    await prisma.invoice.deleteMany()
    await prisma.material.deleteMany()
    await prisma.provider.deleteMany()
    await prisma.productGroup.deleteMany()
    await prisma.batchProcessing.deleteMany()

    // Delete authentication-related data
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.verification.deleteMany()

    // Delete users last (they have foreign key references)
    await prisma.user.deleteMany()

    console.log('✅ Complete database cleanup completed')

    // Create the empty user via Better Auth server API
    console.log('👤 Creating empty user via Better Auth...')
    await auth.api.signUpEmail({
        body: {
            email: 'x.marinba@sorigue.com',
            password: 'facturas@2025',
            name: 'Sorigue'
        }
    })

    // Resolve created user from DB
    const user = await prisma.user.findUnique({ where: { email: 'x.marinba@sorigue.com' } })
    if (!user) {
        throw new Error('Failed to create empty user via Better Auth')
    }

    console.log('✅ Empty user created via Better Auth')
    console.log(`Created user: ${user.email}`)

    // Final verification
    const totalUsers = await prisma.user.count()

    console.log('\n🔒 Final Verification:')
    console.log(`  - Total users in system: ${totalUsers}`)
    console.log('✅ Database seeded successfully with empty user!')
}

main()
    .catch((e) => {
        console.error('❌ Error during seeding:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
