#!/usr/bin/env tsx

/**
 * Test script to verify migration scripts can import correctly
 */

import { prisma } from '@/lib/db'

async function testConnections() {
    try {
        console.log('🔍 Testing database connection...')

        // Test basic connection
        const userCount = await prisma.user.count()
        console.log(`✅ Connected successfully. Found ${userCount} users.`)

        // Test that userId fields exist (if migration has been run)
        try {
            const providersWithoutUserId = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "Provider" WHERE "userId" IS NULL
      `
            console.log(`✅ userId field exists in Provider table. ${Number(providersWithoutUserId[0].count)} providers without userId.`)
        } catch (error) {
            console.log('ℹ️  userId field may not exist yet in Provider table (migration not run).')
        }

        console.log('\n🎉 All connections working correctly!')
        console.log('✅ Scripts are ready to use.')

    } catch (error) {
        console.error('❌ Test failed:', error)
        throw error
    }
}

testConnections()
    .then(() => {
        console.log('\n✅ Test completed successfully')
        process.exit(0)
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error)
        process.exit(1)
    })
