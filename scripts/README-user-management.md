# User Management Scripts

This directory contains scripts for managing users and their data in the invoice management platform.

## Available Scripts

### 📋 List Users
View all users in the system with detailed information about their data.

```bash
npm run list:users
```

**Output includes:**
- User ID, name, email, creation date
- Email verification status
- Data counts (providers, materials, invoices, etc.)
- System summary statistics

---

### 🗑️ Delete User by ID
Permanently delete a user and ALL their associated data by user ID.

```bash
npm run delete:user <USER_ID>
```

**Example:**
```bash
npm run delete:user cm2abc123xyz
```

---

### 🗑️ Delete User by Email
Permanently delete a user and ALL their associated data by email address.

```bash
npm run delete:user-by-email <EMAIL>
```

**Example:**
```bash
npm run delete:user-by-email user@example.com
```

---

### 🌱 Seed Hacelerix User
Create comprehensive mock data for the Hacelerix user (info@hacelerix.com).

```bash
npm run seed:hacelerix
```

**Creates:**
- User account with authentication (email: info@hacelerix.com, password: hacelerix)
- 20 construction materials with realistic Spanish data
- 9 suppliers across Spain (material suppliers + machinery rental)
- 54-72 invoices with realistic dates and quantities
- Price alerts for significant increases
- Work orders for Spanish construction projects

---

## Safety Features

### ⚠️ Data Isolation
All scripts are designed to **only affect the specified user's data**. Other users' data remains completely untouched.

### 🔒 Deletion Order
User deletion follows the correct foreign key constraint order:
1. Price alerts
2. Invoice items
3. Material-provider relationships
4. Provider aliases
5. Invoices
6. Materials
7. Providers
8. Product groups
9. Batch processing records
10. User sessions
11. User accounts
12. Verification records
13. User record

### ✅ Verification
Each deletion script includes:
- Data count preview before deletion
- Step-by-step deletion progress
- Final verification that user is completely removed
- Safety checks to ensure other users' data is preserved

## Usage Examples

### 1. Check existing users
```bash
npm run list:users
```

### 2. Create test data for Hacelerix
```bash
npm run seed:hacelerix
```

### 3. Delete a specific user
```bash
npm run delete:user-by-email info@hacelerix.com
```

### 4. Verify deletion worked
```bash
npm run list:users
```

## Database Relations Handled

The deletion scripts properly handle all database relationships:

- **Users** → Providers, Materials, Product Groups, Sessions, Accounts
- **Providers** → Invoices, Material-Provider relationships, Price Alerts, Provider Aliases
- **Materials** → Invoice Items, Material-Provider relationships, Price Alerts
- **Invoices** → Invoice Items, Price Alerts
- **Batch Processing** → User-specific processing records

## Important Notes

⚠️ **WARNING**: User deletion is **PERMANENT** and cannot be undone!

✅ **Safe**: Scripts only affect the specified user's data - other users remain untouched

🔍 **Recommended workflow**:
1. Use `list:users` to see current users
2. Verify the correct user ID/email
3. Run deletion script
4. Use `list:users` again to confirm

## Technical Details

- Uses Prisma transactions for data integrity
- Follows foreign key constraints in deletion order
- Includes comprehensive error handling
- Provides detailed logging and progress feedback
- Supports both TypeScript execution via `tsx`
