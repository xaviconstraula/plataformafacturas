import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

async function deleteUserByEmail(email: string) {
    console.log(`🗑️ Starting deletion process for user email: ${email}`)

    // First, find the user by email
    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            name: true
        }
    })

    if (!user) {
        console.log(`❌ User with email ${email} not found`)
        return false
    }

    console.log(`Found user: ${user.name} (${user.email}) - ID: ${user.id}`)

    // Get data counts before deletion for confirmation
    const dataCounts = {
        providers: await prisma.provider.count({ where: { userId: user.id } }),
        materials: await prisma.material.count({ where: { userId: user.id } }),
        productGroups: await prisma.productGroup.count({ where: { userId: user.id } }),
        batchProcessing: await prisma.batchProcessing.count({ where: { userId: user.id } }),
        invoices: await prisma.invoice.count({ 
            where: { provider: { userId: user.id } } 
        }),
        sessions: await prisma.session.count({ where: { userId: user.id } }),
        accounts: await prisma.account.count({ where: { userId: user.id } })
    }

    console.log('📊 Data to be deleted:')
    console.log(`  - Providers: ${dataCounts.providers}`)
    console.log(`  - Materials: ${dataCounts.materials}`)
    console.log(`  - Product Groups: ${dataCounts.productGroups}`)
    console.log(`  - Invoices: ${dataCounts.invoices}`)
    console.log(`  - Batch Processing Records: ${dataCounts.batchProcessing}`)
    console.log(`  - User Sessions: ${dataCounts.sessions}`)
    console.log(`  - User Accounts: ${dataCounts.accounts}`)

    console.log('\n🔄 Starting deletion process...')

    try {
        // Delete in correct order to respect foreign key constraints
        console.log('Deleting price alerts...')
        const deletedAlerts = await prisma.priceAlert.deleteMany({
            where: {
                AND: [
                    { provider: { userId: user.id } },
                    { material: { userId: user.id } }
                ]
            }
        })
        console.log(`✅ Deleted ${deletedAlerts.count} price alerts`)

        console.log('Deleting invoice items...')
        const deletedItems = await prisma.invoiceItem.deleteMany({
            where: { 
                invoice: { 
                    provider: { userId: user.id } 
                } 
            }
        })
        console.log(`✅ Deleted ${deletedItems.count} invoice items`)

        console.log('Deleting material-provider relationships...')
        const deletedMaterialProviders = await prisma.materialProvider.deleteMany({
            where: {
                AND: [
                    { provider: { userId: user.id } },
                    { material: { userId: user.id } }
                ]
            }
        })
        console.log(`✅ Deleted ${deletedMaterialProviders.count} material-provider relationships`)

        console.log('Deleting provider aliases...')
        const deletedAliases = await prisma.providerAlias.deleteMany({
            where: { 
                provider: { userId: user.id } 
            }
        })
        console.log(`✅ Deleted ${deletedAliases.count} provider aliases`)

        console.log('Deleting invoices...')
        const deletedInvoices = await prisma.invoice.deleteMany({
            where: { 
                provider: { userId: user.id } 
            }
        })
        console.log(`✅ Deleted ${deletedInvoices.count} invoices`)

        console.log('Deleting materials...')
        const deletedMaterials = await prisma.material.deleteMany({
            where: { userId: user.id }
        })
        console.log(`✅ Deleted ${deletedMaterials.count} materials`)

        console.log('Deleting providers...')
        const deletedProviders = await prisma.provider.deleteMany({
            where: { userId: user.id }
        })
        console.log(`✅ Deleted ${deletedProviders.count} providers`)

        console.log('Deleting product groups...')
        const deletedProductGroups = await prisma.productGroup.deleteMany({
            where: { userId: user.id }
        })
        console.log(`✅ Deleted ${deletedProductGroups.count} product groups`)

        console.log('Deleting batch processing records...')
        const deletedBatches = await prisma.batchProcessing.deleteMany({
            where: { userId: user.id }
        })
        console.log(`✅ Deleted ${deletedBatches.count} batch processing records`)

        console.log('Deleting user sessions...')
        const deletedSessions = await prisma.session.deleteMany({
            where: { userId: user.id }
        })
        console.log(`✅ Deleted ${deletedSessions.count} user sessions`)

        console.log('Deleting user accounts...')
        const deletedAccounts = await prisma.account.deleteMany({
            where: { userId: user.id }
        })
        console.log(`✅ Deleted ${deletedAccounts.count} user accounts`)

        console.log('Deleting verification records...')
        const deletedVerifications = await prisma.verification.deleteMany({
            where: { identifier: user.email }
        })
        console.log(`✅ Deleted ${deletedVerifications.count} verification records`)

        console.log('Deleting user...')
        await prisma.user.delete({
            where: { id: user.id }
        })
        console.log(`✅ Deleted user: ${user.name} (${user.email})`)

        console.log('\n🎉 User deletion completed successfully!')
        
        // Final verification
        const remainingUser = await prisma.user.findUnique({
            where: { id: user.id }
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
        console.log('❌ Please provide a user email')
        console.log('Usage: npm run delete:user-by-email <email>')
        console.log('Example: npm run delete:user-by-email user@example.com')
        process.exit(1)
    }

    const email = args[0]
    
    if (!email || email.trim() === '' || !email.includes('@')) {
        console.log('❌ Invalid email provided')
        process.exit(1)
    }

    console.log('🚨 WARNING: This will permanently delete the user and ALL associated data!')
    console.log(`User email to delete: ${email}`)
    
    const success = await deleteUserByEmail(email.trim())
    
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
