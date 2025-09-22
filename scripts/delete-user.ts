import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

async function deleteUser(userId: string) {
    console.log(`🗑️ Starting deletion process for user ID: ${userId}`)

    // First, verify the user exists
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true
        }
    })

    if (!user) {
        console.log(`❌ User with ID ${userId} not found`)
        return false
    }

    console.log(`Found user: ${user.name} (${user.email})`)

    // Get data counts before deletion for confirmation
    const dataCounts = {
        providers: await prisma.provider.count({ where: { userId } }),
        materials: await prisma.material.count({ where: { userId } }),
        productGroups: await prisma.productGroup.count({ where: { userId } }),
        batchProcessing: await prisma.batchProcessing.count({ where: { userId } }),
        invoices: await prisma.invoice.count({
            where: { provider: { userId } }
        }),
        sessions: await prisma.session.count({ where: { userId } }),
        accounts: await prisma.account.count({ where: { userId } })
    }

    console.log('📊 Data to be deleted:')
    console.log(`  - Providers: ${dataCounts.providers}`)
    console.log(`  - Materials: ${dataCounts.materials}`)
    console.log(`  - Product Groups: ${dataCounts.productGroups}`)
    console.log(`  - Invoices: ${dataCounts.invoices}`)
    console.log(`  - Batch Processing Records: ${dataCounts.batchProcessing}`)
    console.log(`  - User Sessions: ${dataCounts.sessions}`)
    console.log(`  - User Accounts: ${dataCounts.accounts}`)

    // Safety confirmation (commented out for script usage, but recommended for manual use)
    // console.log('\n⚠️  This action cannot be undone!')
    // console.log('Please confirm by typing "DELETE" to proceed:')
    // const confirmation = await new Promise<string>((resolve) => {
    //     process.stdin.once('data', (data) => resolve(data.toString().trim()))
    // })
    // 
    // if (confirmation !== 'DELETE') {
    //     console.log('❌ Deletion cancelled')
    //     return false
    // }

    console.log('\n🔄 Starting deletion process...')

    try {
        // Delete in correct order to respect foreign key constraints
        console.log('Deleting price alerts...')
        const deletedAlerts = await prisma.priceAlert.deleteMany({
            where: {
                AND: [
                    { provider: { userId } },
                    { material: { userId } }
                ]
            }
        })
        console.log(`✅ Deleted ${deletedAlerts.count} price alerts`)

        console.log('Deleting invoice items...')
        const deletedItems = await prisma.invoiceItem.deleteMany({
            where: {
                invoice: {
                    provider: { userId }
                }
            }
        })
        console.log(`✅ Deleted ${deletedItems.count} invoice items`)

        console.log('Deleting material-provider relationships...')
        const deletedMaterialProviders = await prisma.materialProvider.deleteMany({
            where: {
                AND: [
                    { provider: { userId } },
                    { material: { userId } }
                ]
            }
        })
        console.log(`✅ Deleted ${deletedMaterialProviders.count} material-provider relationships`)

        console.log('Deleting provider aliases...')
        const deletedAliases = await prisma.providerAlias.deleteMany({
            where: {
                provider: { userId }
            }
        })
        console.log(`✅ Deleted ${deletedAliases.count} provider aliases`)

        console.log('Deleting invoices...')
        const deletedInvoices = await prisma.invoice.deleteMany({
            where: {
                provider: { userId }
            }
        })
        console.log(`✅ Deleted ${deletedInvoices.count} invoices`)

        console.log('Deleting materials...')
        const deletedMaterials = await prisma.material.deleteMany({
            where: { userId }
        })
        console.log(`✅ Deleted ${deletedMaterials.count} materials`)

        console.log('Deleting providers...')
        const deletedProviders = await prisma.provider.deleteMany({
            where: { userId }
        })
        console.log(`✅ Deleted ${deletedProviders.count} providers`)

        console.log('Deleting product groups...')
        const deletedProductGroups = await prisma.productGroup.deleteMany({
            where: { userId }
        })
        console.log(`✅ Deleted ${deletedProductGroups.count} product groups`)

        console.log('Deleting batch processing records...')
        const deletedBatches = await prisma.batchProcessing.deleteMany({
            where: { userId }
        })
        console.log(`✅ Deleted ${deletedBatches.count} batch processing records`)

        console.log('Deleting user sessions...')
        const deletedSessions = await prisma.session.deleteMany({
            where: { userId }
        })
        console.log(`✅ Deleted ${deletedSessions.count} user sessions`)

        console.log('Deleting user accounts...')
        const deletedAccounts = await prisma.account.deleteMany({
            where: { userId }
        })
        console.log(`✅ Deleted ${deletedAccounts.count} user accounts`)

        console.log('Deleting verification records...')
        const deletedVerifications = await prisma.verification.deleteMany({
            where: { identifier: user.email }
        })
        console.log(`✅ Deleted ${deletedVerifications.count} verification records`)

        console.log('Deleting user...')
        await prisma.user.delete({
            where: { id: userId }
        })
        console.log(`✅ Deleted user: ${user.name} (${user.email})`)

        console.log('\n🎉 User deletion completed successfully!')

        // Final verification
        const remainingUser = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (remainingUser) {
            console.log('❌ Error: User still exists in database')
            return false
        }

        console.log('✅ Verification: User completely removed from database')
        return true

    } catch (error) {
        console.error('❌ Error during deletion:', error)
        return false
    }
}

async function main() {
    const args = process.argv.slice(2)

    if (args.length === 0) {
        console.log('❌ Please provide a user ID')
        console.log('Usage: npm run delete:user <user-id>')
        console.log('Example: npm run delete:user cm2abc123xyz')
        process.exit(1)
    }

    const userId = args[0]

    if (!userId || userId.trim() === '') {
        console.log('❌ Invalid user ID provided')
        process.exit(1)
    }

    console.log('🚨 WARNING: This will permanently delete the user and ALL associated data!')
    console.log(`User ID to delete: ${userId}`)

    const success = await deleteUser(userId.trim())

    if (success) {
        console.log('✅ User deletion completed successfully')
        process.exit(0)
    } else {
        console.log('❌ User deletion failed')
        process.exit(1)
    }
}

main()
    .catch((e) => {
        console.error('❌ Fatal error during user deletion:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
