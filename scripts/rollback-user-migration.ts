#!/usr/bin/env tsx

/**
 * Rollback script to remove user assignments from all entities
 * 
 * ⚠️  WARNING: This will unassign ALL data from users!
 * Only use this in development or if you need to rollback a migration.
 * 
 * Usage:
 * npx tsx scripts/rollback-user-migration.ts [--confirm]
 */

import { prisma } from '@/lib/db'

async function rollbackUserMigration(confirmed: boolean = false) {
  if (!confirmed) {
    console.log('⚠️  WARNING: This script will remove ALL user assignments!')
    console.log('   This means all providers, materials, and product groups will be unassigned.')
    console.log('   This action cannot be easily undone.')
    console.log('')
    console.log('   To confirm, run: npx tsx scripts/rollback-user-migration.ts --confirm')
    return
  }

  console.log('🔄 Starting rollback of user assignments...')

  try {
    await prisma.$transaction(async (tx) => {
      // Rollback Providers
      console.log('📦 Removing user assignments from Providers...')
      const providersResult = await tx.$executeRaw`
        UPDATE "Provider" 
        SET "userId" = NULL, "updatedAt" = NOW()
        WHERE "userId" IS NOT NULL
      `
      console.log(`✅ Unassigned ${providersResult} providers`)

      // Rollback Materials
      console.log('🔧 Removing user assignments from Materials...')
      const materialsResult = await tx.$executeRaw`
        UPDATE "Material" 
        SET "userId" = NULL, "updatedAt" = NOW()
        WHERE "userId" IS NOT NULL
      `
      console.log(`✅ Unassigned ${materialsResult} materials`)

      // Rollback ProductGroups
      console.log('📋 Removing user assignments from Product Groups...')
      const productGroupsResult = await tx.$executeRaw`
        UPDATE "ProductGroup" 
        SET "userId" = NULL, "updatedAt" = NOW()
        WHERE "userId" IS NOT NULL
      `
      console.log(`✅ Unassigned ${productGroupsResult} product groups`)

      // Rollback BatchProcessing
      console.log('⚙️ Removing user assignments from Batch Processing...')
      const batchProcessingResult = await tx.batchProcessing.updateMany({
        where: {
          userId: { not: null }
        },
        data: {
          userId: null
        }
      })
      console.log(`✅ Unassigned ${batchProcessingResult.count} batch processing records`)

      console.log('\n📊 Rollback Summary:')
      console.log(`- Providers: ${providersResult}`)
      console.log(`- Materials: ${materialsResult}`)
      console.log(`- Product Groups: ${productGroupsResult}`)
      console.log(`- Batch Processing: ${batchProcessingResult.count}`)
      console.log(`- Total records unassigned: ${Number(providersResult) + Number(materialsResult) + Number(productGroupsResult) + batchProcessingResult.count}`)
    })

    console.log('\n🎉 Rollback completed successfully!')
    console.log('💡 All data is now unassigned from users')

  } catch (error) {
    console.error('❌ Rollback failed:', error)
    throw error
  }
}

// Check command line arguments
const confirmed = process.argv.includes('--confirm')

rollbackUserMigration(confirmed)
  .then(() => {
    console.log('✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
