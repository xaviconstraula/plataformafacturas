#!/usr/bin/env tsx

/**
 * Migration script to assign all existing data to a specific user
 * 
 * IMPORTANT: Run this AFTER running `prisma migrate dev` to add the userId fields
 * 
 * Usage:
 * 1. First run: npx prisma migrate dev --name "add-user-relations"
 * 2. Then run: npx tsx scripts/migrate-data-to-user.ts <userId>
 * 
 * This script will:
 * 1. Update all Providers to belong to the specified user
 * 2. Update all Materials to belong to the specified user  
 * 3. Update all ProductGroups to belong to the specified user
 * 4. Update all BatchProcessing records to belong to the specified user
 */

import { prisma } from '@/lib/db'

async function migrateDataToUser(userId: string) {
  console.log(`🚀 Starting migration to assign all data to user: ${userId}`)

  try {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new Error(`User with ID ${userId} not found`)
    }

    console.log(`✅ Found user: ${user.name} (${user.email})`)

    // Start transaction for data consistency
    await prisma.$transaction(async (tx) => {
      // Use raw SQL for migration since TypeScript types might not be updated yet

      // 1. Migrate Providers
      console.log('📦 Migrating Providers...')
      const providersResult = await tx.$executeRaw`
        UPDATE "Provider" 
        SET "userId" = ${userId}, "updatedAt" = NOW()
        WHERE "userId" IS NULL
      `
      console.log(`✅ Updated ${providersResult} providers`)

      // 2. Migrate Materials  
      console.log('🔧 Migrating Materials...')
      const materialsResult = await tx.$executeRaw`
        UPDATE "Material" 
        SET "userId" = ${userId}, "updatedAt" = NOW()
        WHERE "userId" IS NULL
      `
      console.log(`✅ Updated ${materialsResult} materials`)

      // 3. Migrate ProductGroups
      console.log('📋 Migrating Product Groups...')
      const productGroupsResult = await tx.$executeRaw`
        UPDATE "ProductGroup" 
        SET "userId" = ${userId}, "updatedAt" = NOW()
        WHERE "userId" IS NULL
      `
      console.log(`✅ Updated ${productGroupsResult} product groups`)

      // 4. Migrate BatchProcessing records (this field already exists)
      console.log('⚙️ Migrating Batch Processing records...')
      const batchProcessingResult = await tx.batchProcessing.updateMany({
        where: {
          userId: null
        },
        data: {
          userId: userId
        }
      })
      console.log(`✅ Updated ${batchProcessingResult.count} batch processing records`)

      console.log('\n📊 Migration Summary:')
      console.log(`- Providers: ${providersResult}`)
      console.log(`- Materials: ${materialsResult}`)
      console.log(`- Product Groups: ${productGroupsResult}`)
      console.log(`- Batch Processing: ${batchProcessingResult.count}`)
      console.log(`- Total records migrated: ${Number(providersResult) + Number(materialsResult) + Number(productGroupsResult) + batchProcessingResult.count}`)
    })

    console.log('\n🎉 Migration completed successfully!')

    // Verify migration by counting records
    console.log('\n🔍 Verification - Counting updated records...')

    const providerCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Provider" WHERE "userId" = ${userId}
    `

    const materialCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Material" WHERE "userId" = ${userId}
    `

    const productGroupCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "ProductGroup" WHERE "userId" = ${userId}
    `

    const batchProcessingCount = await prisma.batchProcessing.count({
      where: { userId: userId }
    })

    console.log(`- ${Number(providerCount[0].count)} providers`)
    console.log(`- ${Number(materialCount[0].count)} materials`)
    console.log(`- ${Number(productGroupCount[0].count)} product groups`)
    console.log(`- ${batchProcessingCount} batch processing records`)

  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

// Check command line arguments
const userId = process.argv[2]

if (!userId) {
  console.error('❌ Usage: npx tsx scripts/migrate-data-to-user.ts <userId>')
  console.error('   Example: npx tsx scripts/migrate-data-to-user.ts cm1a2b3c4d5e6f7g8h9i0j1k')
  process.exit(1)
}

// Validate userId format (more flexible)
if (userId.length < 20 || !/^[a-zA-Z0-9]+$/.test(userId)) {
  console.error('❌ Invalid userId format. Expected at least 20 alphanumeric characters.')
  process.exit(1)
}

// Run migration
migrateDataToUser(userId)
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
