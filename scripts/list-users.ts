#!/usr/bin/env tsx

/**
 * Helper script to list all users in the database
 * Useful for finding the correct user ID for migration
 * 
 * Usage:
 * npx tsx scripts/list-users.ts
 */

import { prisma } from '@/lib/db'

async function listUsers() {
  try {
    console.log('👥 Fetching all users...\n')

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (users.length === 0) {
      console.log('❌ No users found in the database')
      console.log('💡 Create a user first before running the migration')
      return
    }

    console.log(`Found ${users.length} user(s):\n`)

    users.forEach((user, index) => {
      console.log(`${index + 1}. User ID: ${user.id}`)
      console.log(`   Name: ${user.name}`)
      console.log(`   Email: ${user.email}`)
      console.log(`   Created: ${user.createdAt.toLocaleDateString()}`)
      console.log('')
    })

    console.log('💡 To migrate data to a user, run:')
    console.log(`   npx tsx scripts/migrate-data-to-user.ts <USER_ID>`)
    console.log('')
    console.log('📋 Example:')
    if (users.length > 0) {
      console.log(`   npx tsx scripts/migrate-data-to-user.ts ${users[0].id}`)
    }

  } catch (error) {
    console.error('❌ Error fetching users:', error)
    throw error
  }
}

listUsers()
  .then(() => {
    console.log('✅ Done')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
