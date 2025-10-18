import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

async function deleteAllMaterialsAndInvoices() {
    console.log('🗑️ Starting deletion process for ALL materials and invoices in the database')

    try {
        // Get counts before deletion for confirmation
        const materialCount = await prisma.material.count()
        const invoiceCount = await prisma.invoice.count()
        const materialProviderCount = await prisma.materialProvider.count()
        const invoiceItemCount = await prisma.invoiceItem.count()
        const priceAlertCount = await prisma.priceAlert.count()

        console.log('📊 Current data counts:')
        console.log(`  - Materials: ${materialCount}`)
        console.log(`  - Invoices: ${invoiceCount}`)
        console.log(`  - Material-Provider relationships: ${materialProviderCount}`)
        console.log(`  - Invoice Items: ${invoiceItemCount}`)
        console.log(`  - Price Alerts: ${priceAlertCount}`)

        if (materialCount === 0 && invoiceCount === 0) {
            console.log('ℹ️ No materials or invoices found in the database. Nothing to delete.')
            return true
        }

        console.log('\n🔄 Starting deletion process...')

        // Delete in correct order to respect foreign key constraints
        console.log('Deleting price alerts...')
        const deletedAlerts = await prisma.priceAlert.deleteMany()
        console.log(`✅ Deleted ${deletedAlerts.count} price alerts`)

        console.log('Deleting invoice items...')
        const deletedItems = await prisma.invoiceItem.deleteMany()
        console.log(`✅ Deleted ${deletedItems.count} invoice items`)

        console.log('Deleting material-provider relationships...')
        const deletedMaterialProviders = await prisma.materialProvider.deleteMany()
        console.log(`✅ Deleted ${deletedMaterialProviders.count} material-provider relationships`)

        console.log('Deleting invoices...')
        const deletedInvoices = await prisma.invoice.deleteMany()
        console.log(`✅ Deleted ${deletedInvoices.count} invoices`)

        console.log('Deleting materials...')
        const deletedMaterials = await prisma.material.deleteMany()
        console.log(`✅ Deleted ${deletedMaterials.count} materials`)

        console.log('\n🎉 All materials and invoices deletion completed successfully!')

        // Final verification
        const remainingMaterials = await prisma.material.count()
        const remainingInvoices = await prisma.invoice.count()
        const remainingMaterialProviders = await prisma.materialProvider.count()
        const remainingInvoiceItems = await prisma.invoiceItem.count()
        const remainingPriceAlerts = await prisma.priceAlert.count()

        console.log('✅ Verification results:')
        console.log(`  - Materials remaining: ${remainingMaterials}`)
        console.log(`  - Invoices remaining: ${remainingInvoices}`)
        console.log(`  - Material-Provider relationships remaining: ${remainingMaterialProviders}`)
        console.log(`  - Invoice Items remaining: ${remainingInvoiceItems}`)
        console.log(`  - Price Alerts remaining: ${remainingPriceAlerts}`)

        if (remainingMaterials > 0 || remainingInvoices > 0 || remainingMaterialProviders > 0 || remainingInvoiceItems > 0 || remainingPriceAlerts > 0) {
            console.log('❌ Warning: Some related records may still exist due to foreign key constraints')
            return false
        }

        console.log('✅ Verification: All materials, invoices and related data completely removed from database')
        return true

    } catch (error) {
        console.error('❌ Error during deletion:', error)
        return false
    }
}

async function main() {
    console.log('🚨 WARNING: This will permanently delete ALL materials, ALL invoices and ALL related data from the database!')
    console.log('This includes:')
    console.log('  - All materials')
    console.log('  - All invoices')
    console.log('  - All material-provider relationships')
    console.log('  - All invoice items')
    console.log('  - All price alerts')
    console.log('')
    console.log('This action CANNOT be undone!')
    console.log('')

    // Simple confirmation - in production you might want to add a proper prompt
    const args = process.argv.slice(2)
    const confirmed = args.includes('--confirm')

    if (!confirmed) {
        console.log('To proceed, run this script with the --confirm flag:')
        console.log('npm run delete:all-materials-and-invoices -- --confirm')
        console.log('')
        console.log('Or use the direct command:')
        console.log('npx tsx scripts/delete-all-materials-and-invoices.ts --confirm')
        process.exit(1)
    }

    const success = await deleteAllMaterialsAndInvoices()

    if (success) {
        console.log('✅ All materials and invoices deletion completed successfully')
        process.exit(0)
    } else {
        console.log('❌ Materials and invoices deletion failed or completed with warnings')
        process.exit(1)
    }
}

main()
    .catch((e) => {
        console.error('❌ Fatal error during materials and invoices deletion:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
