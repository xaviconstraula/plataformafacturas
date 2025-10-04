#!/usr/bin/env tsx

/**
 * PRODUCTION-SAFE Migration script for adding user authentication
 * 
 * This script implements a 3-step migration process:
 * 1. Add optional userId columns (via Prisma migrate)
 * 2. Populate userId columns with data (this script)
 * 3. Make userId columns required (via second Prisma migrate)
 * 
 * Usage:
 * npx tsx scripts/production-safe-migration.ts <userId> [--step=1|2|3]
 * 
 * Steps:
 * --step=1: Check current state and prepare
 * --step=2: Populate userId fields (default)
 * --step=3: Verify data before making fields required
 */

import { prisma } from '@/lib/db'

interface MigrationState {
  providersWithoutUserId: number
  materialsWithoutUserId: number
  productGroupsWithoutUserId: number
  batchProcessingWithoutUserId: number
  totalUsers: number
}

async function checkMigrationState(): Promise<MigrationState> {
  // Prefer Prisma counts; if columns don't exist yet, fall back to table counts
  try {
    const [
      providersWithoutUserId,
      materialsWithoutUserId,
      productGroupsWithoutUserId,
      batchProcessingWithoutUserId,
      totalUsers
    ] = await Promise.all([
      prisma.provider.count({ where: { userId: null } }),
      prisma.material.count({ where: { userId: null } }),
      prisma.productGroup.count({ where: { userId: null } }),
      prisma.batchProcessing.count({ where: { userId: null } }),
      prisma.user.count()
    ])

    return {
      providersWithoutUserId,
      materialsWithoutUserId,
      productGroupsWithoutUserId,
      batchProcessingWithoutUserId,
      totalUsers
    }
  } catch (error) {
    // If userId columns don't exist yet, return counts assuming all need migration
    console.log('⚠️  userId columns may not exist yet, checking table counts...')
    const [
      totalProviders,
      totalMaterials,
      totalProductGroups,
      batchProcessingWithoutUserId,
      totalUsers
    ] = await Promise.all([
      prisma.provider.count(),
      prisma.material.count(),
      prisma.productGroup.count(),
      prisma.batchProcessing.count({ where: { userId: null } }),
      prisma.user.count()
    ])

    return {
      providersWithoutUserId: totalProviders,
      materialsWithoutUserId: totalMaterials,
      productGroupsWithoutUserId: totalProductGroups,
      batchProcessingWithoutUserId,
      totalUsers
    }
  }
}

async function step1_PrepareAndCheck(userId: string) {
  console.log('🔍 STEP 1: Checking current migration state...\n')

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    throw new Error(`❌ User with ID ${userId} not found`)
  }

  console.log(`✅ Target user found: ${user.name} (${user.email})`)

  const state = await checkMigrationState()

  console.log('\n📊 Current Data State:')
  console.log(`- Total users: ${state.totalUsers}`)
  console.log(`- Providers without userId: ${state.providersWithoutUserId}`)
  console.log(`- Materials without userId: ${state.materialsWithoutUserId}`)
  console.log(`- Product Groups without userId: ${state.productGroupsWithoutUserId}`)
  console.log(`- Batch Processing without userId: ${state.batchProcessingWithoutUserId}`)

  if (state.providersWithoutUserId === 0 &&
    state.materialsWithoutUserId === 0 &&
    state.productGroupsWithoutUserId === 0 &&
    state.batchProcessingWithoutUserId === 0) {
    console.log('\n🎉 All data is already migrated!')
    return false
  }

  console.log('\n💡 Ready for Step 2: Data Population')
  console.log(`   Run: npx tsx scripts/production-safe-migration.ts ${userId} --step=2`)

  return true
}

async function step2_PopulateData(userId: string) {
  console.log('📝 STEP 2: Populating userId fields...\n')

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    throw new Error(`❌ User with ID ${userId} not found`)
  }

  console.log(`✅ Migrating data to user: ${user.name} (${user.email})`)

  const initialState = await checkMigrationState()

  if (initialState.providersWithoutUserId === 0 &&
    initialState.materialsWithoutUserId === 0 &&
    initialState.productGroupsWithoutUserId === 0 &&
    initialState.batchProcessingWithoutUserId === 0) {
    console.log('\n🎉 All data is already migrated!')
    return
  }

  console.log('\n🚀 Starting data migration...')

  try {
    await prisma.$transaction(async (tx) => {
      // Migrate Providers
      if (initialState.providersWithoutUserId > 0) {
        console.log(`📦 Migrating ${initialState.providersWithoutUserId} providers...`)
        const providersResult = await tx.provider.updateMany({
          where: { userId: null },
          data: { userId, updatedAt: new Date() }
        })
        console.log(`✅ Updated ${providersResult.count} providers`)
      }

      // Migrate Materials
      if (initialState.materialsWithoutUserId > 0) {
        console.log(`🔧 Migrating ${initialState.materialsWithoutUserId} materials...`)
        const materialsResult = await tx.material.updateMany({
          where: { userId: null },
          data: { userId, updatedAt: new Date() }
        })
        console.log(`✅ Updated ${materialsResult.count} materials`)
      }

      // Migrate ProductGroups
      if (initialState.productGroupsWithoutUserId > 0) {
        console.log(`📋 Migrating ${initialState.productGroupsWithoutUserId} product groups...`)
        const productGroupsResult = await tx.productGroup.updateMany({
          where: { userId: null },
          data: { userId, updatedAt: new Date() }
        })
        console.log(`✅ Updated ${productGroupsResult.count} product groups`)
      }

      // Migrate BatchProcessing (this field already exists)
      if (initialState.batchProcessingWithoutUserId > 0) {
        console.log(`⚙️ Migrating ${initialState.batchProcessingWithoutUserId} batch processing records...`)
        const batchProcessingResult = await tx.batchProcessing.updateMany({
          where: { userId: null },
          data: { userId: userId }
        })
        console.log(`✅ Updated ${batchProcessingResult.count} batch processing records`)
      }
    })

    console.log('\n🎉 Data migration completed successfully!')

    // Verify final state
    const finalState = await checkMigrationState()
    console.log('\n🔍 Final verification:')
    console.log(`- Providers without userId: ${finalState.providersWithoutUserId}`)
    console.log(`- Materials without userId: ${finalState.materialsWithoutUserId}`)
    console.log(`- Product Groups without userId: ${finalState.productGroupsWithoutUserId}`)
    console.log(`- Batch Processing without userId: ${finalState.batchProcessingWithoutUserId}`)

    if (finalState.providersWithoutUserId === 0 &&
      finalState.materialsWithoutUserId === 0 &&
      finalState.productGroupsWithoutUserId === 0 &&
      finalState.batchProcessingWithoutUserId === 0) {
      console.log('\n✅ All data successfully migrated!')
      console.log('\n💡 Ready for Step 3: Make fields required')
      console.log('   1. Update schema to make userId fields required')
      console.log('   2. Run: npx prisma migrate dev --name "make-user-fields-required"')
      console.log(`   3. Run: npx tsx scripts/production-safe-migration.ts ${userId} --step=3`)
    } else {
      console.log('\n⚠️  Some data was not migrated. Please investigate.')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

async function step3_VerifyBeforeRequired(userId: string) {
  console.log('✅ STEP 3: Final verification before making fields required...\n')

  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    throw new Error(`❌ User with ID ${userId} not found`)
  }

  const state = await checkMigrationState()

  console.log('🔍 Final State Check:')
  console.log(`- Providers without userId: ${state.providersWithoutUserId}`)
  console.log(`- Materials without userId: ${state.materialsWithoutUserId}`)
  console.log(`- Product Groups without userId: ${state.productGroupsWithoutUserId}`)
  console.log(`- Batch Processing without userId: ${state.batchProcessingWithoutUserId}`)

  if (state.providersWithoutUserId === 0 &&
    state.materialsWithoutUserId === 0 &&
    state.productGroupsWithoutUserId === 0 &&
    state.batchProcessingWithoutUserId === 0) {

    // Additional verification: count user's data
    const [providerCount, materialCount, productGroupCount] = await Promise.all([
      prisma.provider.count({ where: { userId } }),
      prisma.material.count({ where: { userId } }),
      prisma.productGroup.count({ where: { userId } })
    ])

    console.log(`\n📊 User ${user.name} now owns:`)
    console.log(`- ${providerCount} providers`)
    console.log(`- ${materialCount} materials`)
    console.log(`- ${productGroupCount} product groups`)

    console.log('\n🎉 ✅ MIGRATION IS COMPLETE AND SAFE!')
    console.log('✅ All data has been successfully assigned to the user.')
    console.log('✅ Schema can now be updated to make userId fields required.')
    console.log('\n💡 The migration is now production-safe!')

  } else {
    console.log('\n❌ ERROR: Some data is still unassigned!')
    console.log('⚠️  DO NOT make userId fields required yet.')
    console.log('🔧 Run step 2 again to complete the migration.')
  }
}

async function runMigration(userId: string, step: number) {
  console.log('🚀 Production-Safe User Migration Tool')
  console.log('=====================================\n')

  try {
    switch (step) {
      case 1:
        await step1_PrepareAndCheck(userId)
        break
      case 2:
        await step2_PopulateData(userId)
        break
      case 3:
        await step3_VerifyBeforeRequired(userId)
        break
      default:
        throw new Error('Invalid step. Use --step=1, --step=2, or --step=3')
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

// Parse command line arguments
const userId = process.argv[2]
const stepArg = process.argv.find(arg => arg.startsWith('--step='))
const step = stepArg ? parseInt(stepArg.split('=')[1]) : 2

if (!userId) {
  console.error('❌ Usage: npx tsx scripts/production-safe-migration.ts <userId> [--step=1|2|3]')
  console.error('   --step=1: Check current state')
  console.error('   --step=2: Populate data (default)')
  console.error('   --step=3: Final verification')
  console.error('   Example: npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=2')
  process.exit(1)
}

// Validate userId format (more flexible)
if (userId.length < 20 || !/^[a-zA-Z0-9]+$/.test(userId)) {
  console.error('❌ Invalid userId format. Expected at least 20 alphanumeric characters.')
  process.exit(1)
}

// Validate step
if (![1, 2, 3].includes(step)) {
  console.error('❌ Invalid step. Use --step=1, --step=2, or --step=3')
  process.exit(1)
}

runMigration(userId, step)
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
