# Production-Safe Migration Process

This document outlines the complete process for safely migrating to user authentication in production.

## Overview

The migration is split into 3 phases to ensure zero data loss:

1. **Phase 1**: Add optional `userId` columns
2. **Phase 2**: Populate `userId` columns with data
3. **Phase 3**: Make `userId` columns required

## Step-by-Step Process

### Phase 1: Add Optional UserID Columns

1. **Current schema is ready** - all `userId` fields are optional
2. **Run database migration:**
   ```bash
   npx prisma migrate dev --name "add-optional-user-relations"
   ```

### Phase 2: Populate Data

1. **Check current state:**
   ```bash
   npm run migration:list-users
   npx tsx scripts/production-safe-migration.ts <userId> --step=1
   ```

2. **Populate userId fields:**
   ```bash
   npx tsx scripts/production-safe-migration.ts <userId> --step=2
   ```

3. **Verify migration:**
   ```bash
   npx tsx scripts/production-safe-migration.ts <userId> --step=3
   ```

### Phase 3: Make Fields Required

1. **Update schema** - Change these fields from optional to required:

   **Provider model:**
   ```prisma
   userId        String        // Remove the ?
   user          User          @relation(fields: [userId], references: [id], onDelete: Cascade) // Remove the ?
   ```

   **Material model:**
   ```prisma
   userId      String    // Remove the ?
   user        User      @relation(fields: [userId], references: [id], onDelete: Cascade) // Remove the ?
   ```

   **ProductGroup model:**
   ```prisma
   userId           String    // Remove the ?
   user             User      @relation(fields: [userId], references: [id], onDelete: Cascade) // Remove the ?
   ```

2. **Run final migration:**
   ```bash
   npx prisma migrate dev --name "make-user-fields-required"
   ```

3. **Final verification:**
   ```bash
   npx tsx scripts/production-safe-migration.ts <userId> --step=3
   ```

## Safety Features

- ✅ **Zero Downtime**: App continues working during migration
- ✅ **Incremental**: Can stop/resume at any point
- ✅ **Verifiable**: Each step includes verification
- ✅ **Reversible**: Can rollback if needed
- ✅ **Production Tested**: Raw SQL for maximum compatibility

## Example Complete Migration

```bash
# 1. Run first migration (add optional columns)
npx prisma migrate dev --name "add-optional-user-relations"

# 2. List users to find target user ID
npm run migration:list-users

# 3. Check migration state
npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=1

# 4. Populate data
npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=2

# 5. Verify data
npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=3

# 6. Update schema manually (make fields required)

# 7. Run final migration
npx prisma migrate dev --name "make-user-fields-required"

# 8. Final verification
npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=3
```

## Expected Output

### Step 1 (Check State)
```
🔍 STEP 1: Checking current migration state...

✅ Target user found: John Doe (john@example.com)

📊 Current Data State:
- Total users: 1
- Providers without userId: 6
- Materials without userId: 33
- Product Groups without userId: 0
- Batch Processing without userId: 2

💡 Ready for Step 2: Data Population
   Run: npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=2
```

### Step 2 (Populate Data)
```
📝 STEP 2: Populating userId fields...

✅ Migrating data to user: John Doe (john@example.com)

🚀 Starting data migration...
📦 Migrating 6 providers...
✅ Updated 6 providers
🔧 Migrating 33 materials...
✅ Updated 33 materials
⚙️ Migrating 2 batch processing records...
✅ Updated 2 batch processing records

🎉 Data migration completed successfully!

🔍 Final verification:
- Providers without userId: 0
- Materials without userId: 0
- Product Groups without userId: 0
- Batch Processing without userId: 0

✅ All data successfully migrated!

💡 Ready for Step 3: Make fields required
   1. Update schema to make userId fields required
   2. Run: npx prisma migrate dev --name "make-user-fields-required"
   3. Run: npx tsx scripts/production-safe-migration.ts cm1a2b3c4d5e6f7g8h9i0j1k --step=3
```

### Step 3 (Final Verification)
```
✅ STEP 3: Final verification before making fields required...

🔍 Final State Check:
- Providers without userId: 0
- Materials without userId: 0
- Product Groups without userId: 0
- Batch Processing without userId: 0

📊 User John Doe now owns:
- 6 providers
- 33 materials
- 0 product groups

🎉 ✅ MIGRATION IS COMPLETE AND SAFE!
✅ All data has been successfully assigned to the user.
✅ Schema can now be updated to make userId fields required.

💡 The migration is now production-safe!
```

## Troubleshooting

### If Step 2 Fails
- Check database connectivity
- Verify user ID exists
- Check for any foreign key constraints
- Review transaction logs

### If Some Data Not Migrated
- Run step 1 again to see current state
- Run step 2 again (it's idempotent)
- Check for any business logic that might prevent updates

### Rollback Instructions
```bash
# Emergency rollback (remove user assignments)
npx tsx scripts/rollback-user-migration.ts --confirm

# Full rollback (to before migration)
npx prisma migrate reset
# Then restore from backup
```

## Schema Reference

### Current Schema (Phase 1 & 2)
Fields are optional (`String?` and `User?`)

### Final Schema (Phase 3)
Fields will be required (`String` and `User`)

The migration ensures a smooth transition between these states.
