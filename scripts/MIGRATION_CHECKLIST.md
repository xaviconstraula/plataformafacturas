# Production Migration Checklist

## Pre-Migration

- [ ] **Backup database** - Create full backup before starting
- [ ] **Test in staging** - Run complete migration in staging environment
- [ ] **Verify user exists** - Ensure target user account is created
- [ ] **Check data counts** - Note current record counts for verification

## Phase 1: Add Optional Columns

- [ ] **Schema updated** - `userId` fields are optional (`String?`)
- [ ] **Run migration:**
  ```bash
  npx prisma migrate dev --name "add-optional-user-relations"
  ```
- [ ] **Verify migration applied** - Check database schema
- [ ] **Test application** - Ensure app still works normally

## Phase 2: Populate Data

- [ ] **Get user ID:**
  ```bash
  npm run migration:list-users
  ```
- [ ] **Check current state:**
  ```bash
  npm run migration:production-safe <USER_ID> --step=1
  ```
- [ ] **Run data migration:**
  ```bash
  npm run migration:production-safe <USER_ID> --step=2
  ```
- [ ] **Verify data migration:**
  ```bash
  npm run migration:production-safe <USER_ID> --step=3
  ```
- [ ] **Test application** - Verify all functionality works

## Phase 3: Make Fields Required

- [ ] **Update schema manually** - Change `String?` to `String` and `User?` to `User`
- [ ] **Run final migration:**
  ```bash
  npx prisma migrate dev --name "make-user-fields-required"
  ```
- [ ] **Final verification:**
  ```bash
  npm run migration:production-safe <USER_ID> --step=3
  ```
- [ ] **Test application** - Complete functional test

## Post-Migration

- [ ] **Update application code** - Add user filtering to queries
- [ ] **Update API endpoints** - Scope data to current user
- [ ] **Test authentication** - Verify user isolation works
- [ ] **Monitor for issues** - Check logs and error rates
- [ ] **Clean up** - Remove migration scripts if desired

## Emergency Procedures

### If Something Goes Wrong

1. **Stop immediately** - Don't proceed to next phase
2. **Assess damage** - Check what data was affected
3. **Rollback if needed:**
   ```bash
   npm run migration:rollback --confirm
   ```
4. **Restore from backup** if necessary
5. **Review logs** and identify issue
6. **Fix issue** and retry from safe checkpoint

### Contact Information

- **Database Admin**: [Contact]
- **DevOps Team**: [Contact]  
- **Application Owner**: [Contact]

## Success Criteria

- ✅ Zero data loss
- ✅ All records assigned to user
- ✅ Application functions normally
- ✅ User isolation verified
- ✅ Performance acceptable

---

**Remember**: Each phase can be rolled back. Only proceed when previous phase is completely verified.
