# User Migration Guide

This guide explains how to migrate existing data to be owned by users after implementing authentication.

## Overview

The application was updated to include user authentication. All main entities (Providers, Materials, ProductGroups) now belong to specific users. This migration script assigns all existing data to a specific user.

## Updated Schema Relations

The following models now include user ownership:

### Provider
- Added `userId` field (required)
- Added `user` relation to User model
- Added index on `userId`

### Material  
- Added `userId` field (required)
- Added `user` relation to User model
- Added index on `userId`

### ProductGroup
- Added `userId` field (required)
- Added `user` relation to User model
- Added index on `userId`

### BatchProcessing
- Already had optional `userId` field
- Will be updated to assign to user

## Migration Steps

### 1. Generate and Run Database Migration

First, create the database migration for the schema changes:

```bash
# Generate migration
npx prisma migrate dev --name "add-user-relations"

# This will:
# - Create migration files
# - Apply changes to database
# - Regenerate Prisma client
```

### 2. Run Data Migration Script

After the database schema is updated, run the data migration script:

```bash
# Basic usage
npx tsx scripts/migrate-data-to-user.ts <userId>

# Example with actual user ID
npx tsx scripts/migrate-data-to-user.ts cm1a2b3c4d5e6f7g8h9i0j1k
```

### 3. Verify Migration

The script will automatically verify the migration by counting records assigned to the user.

## Script Features

### Safety Features
- ✅ Validates user exists before migration
- ✅ Uses database transactions for consistency
- ✅ Only updates records without existing userId (prevents double migration)
- ✅ Provides detailed progress logging
- ✅ Automatic verification of migrated data

### What Gets Migrated
- **Providers**: All providers without userId assigned to specified user
- **Materials**: All materials without userId assigned to specified user  
- **ProductGroups**: All product groups without userId assigned to specified user
- **BatchProcessing**: All batch processing records without userId assigned to specified user

### Migration Process
1. Verifies target user exists
2. Starts database transaction
3. Updates each entity type using optimized SQL
4. Provides progress feedback
5. Shows migration summary
6. Verifies results with count queries

## Example Output

```
🚀 Starting migration to assign all data to user: cm1a2b3c4d5e6f7g8h9i0j1k
✅ Found user: John Doe (john@example.com)
📦 Migrating Providers...
✅ Updated 15 providers
🔧 Migrating Materials...
✅ Updated 234 materials
📋 Migrating Product Groups...
✅ Updated 12 product groups
⚙️ Migrating Batch Processing records...
✅ Updated 5 batch processing records

📊 Migration Summary:
- Providers: 15
- Materials: 234
- Product Groups: 12
- Batch Processing: 5
- Total records migrated: 266

🎉 Migration completed successfully!

🔍 Verification - Counting updated records...
- 15 providers
- 234 materials
- 12 product groups
- 5 batch processing records
```

## Important Notes

### Prerequisites
- User must exist in the database before running migration
- Database schema must be updated with `prisma migrate dev`
- All related tables (Invoice, InvoiceItem, etc.) will automatically be linked through foreign key relationships

### Safety
- Script only updates records that don't already have a userId
- Can be run multiple times safely
- Uses transactions to ensure data consistency
- Validates user ID format before processing

### Rollback
If you need to rollback the migration:

```sql
-- Remove user assignments (use with caution!)
UPDATE "Provider" SET "userId" = NULL;
UPDATE "Material" SET "userId" = NULL;  
UPDATE "ProductGroup" SET "userId" = NULL;
UPDATE "BatchProcessing" SET "userId" = NULL;
```

## Troubleshooting

### Common Issues

1. **User not found**: Ensure the user ID is correct and the user exists in the database
2. **Permission errors**: Ensure database user has UPDATE permissions
3. **Foreign key constraints**: Ensure all related data is consistent

### Getting User ID

To find existing user IDs:

```sql
SELECT id, email, name FROM "user";
```

Or using Prisma Studio:
```bash
npx prisma studio
```

## Next Steps

After migration:
1. Update your application code to filter data by user
2. Add user-specific queries to your API endpoints
3. Update UI components to show user-specific data
4. Test authentication and authorization flows
