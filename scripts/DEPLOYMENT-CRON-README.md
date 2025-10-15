# Cron Job Deployment Guide for Batch Processing

## Overview

Your application now includes automatic batch processing that runs independently of user sessions. The cron job checks for completed invoice batches every 30 seconds and processes them automatically.

## What Happens During Deploy

### Automatic Setup (Recommended)

Your `npm run deploy` script now includes:
```bash
sudo git pull origin main && sudo npm install && sudo npx prisma db push && sudo npm run build && pm2 restart ctboxapp && ./scripts/setup-batch-cron.sh
```

The `./scripts/setup-batch-cron.sh` will:
- ✅ Recreate the wrapper script with the current project path
- ✅ Ensure the logs directory exists
- ✅ Add/update cron entries (safe to run multiple times)
- ✅ Verify the setup

### Manual Setup (Alternative)

If you need to set up manually or troubleshoot:

```bash
# Make setup script executable
chmod +x scripts/setup-batch-cron.sh

# Run setup
./scripts/setup-batch-cron.sh
```

## What Happens During Server Reboot

### Cron Service (Automatic)
- ✅ Cron is a system service that starts automatically
- ✅ Your cron jobs will resume running every 30 seconds
- ✅ No manual intervention needed

### Verification After Reboot

```bash
# Check if cron service is running
sudo systemctl status cron

# Check your cron jobs are still there
crontab -l

# Check recent logs
tail -f logs/batch-cron.log
```

## Troubleshooting After Deploy/Reboot

### 1. Check Cron Job Status

```bash
# Verify cron service
sudo systemctl status cron

# Check your cron entries
crontab -l

# Should show entries like:
# * * * * * /path/to/project/scripts/run-batch-check.sh
# * * * * * sleep 30; /path/to/project/scripts/run-batch-check.sh
```

### 2. Test Manual Execution

```bash
# Test the cron script manually
npm run batch:cron

# Check exit code (should be 0)
echo $?

# Check logs
tail -n 20 logs/batch-cron.log
```

### 3. Check Permissions

```bash
# Ensure wrapper script is executable
ls -la scripts/run-batch-check.sh

# Should show: -rwxr-xr-x
```

### 4. Check Environment Variables

```bash
# Test that .env is loaded
cd /path/to/your/project
npm run batch:cron 2>&1 | head -5
```

### 5. Common Issues

**Issue**: `npm: command not found`
```bash
# Fix PATH in wrapper script
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
```

**Issue**: `Database connection failed`
```bash
# Check DATABASE_URL in .env
grep DATABASE_URL .env
```

**Issue**: `Google API key missing`
```bash
# Check GOOGLE_GENAI_API_KEY in .env
grep GOOGLE_GENAI_API_KEY .env
```

## Monitoring

### View Real-time Logs
```bash
tail -f logs/batch-cron.log
```

### Check Recent Activity
```bash
# Last 10 runs
tail -n 50 logs/batch-cron.log | grep "Starting batch cron check\|Batch cron check completed\|Found.*batches"

# Count successful runs today
grep "Batch cron check completed successfully" logs/batch-cron.log | wc -l
```

### Check for Errors
```bash
# Check for errors in last hour
grep -E "ERROR|error|Error" logs/batch-cron.log | tail -10

# Check database connection issues
grep "connection\|Connection" logs/batch-cron.log | tail -5
```

## Maintenance

### Update Cron Job

If you move the project directory or change the setup:

```bash
# Remove old cron entries
crontab -e  # Delete the batch checker lines

# Re-run setup
./scripts/setup-batch-cron.sh
```

### Disable Cron Job Temporarily

```bash
# Comment out the lines in crontab
crontab -e

# Add # before the batch checker entries:
# * * * * * /path/to/project/scripts/run-batch-check.sh
# * * * * * sleep 30; /path/to/project/scripts/run-batch-check.sh
```

### Remove Cron Job Completely

```bash
# Edit crontab and remove the batch checker entries
crontab -e

# Or reset crontab completely (removes all cron jobs)
crontab -r
```

## Advanced: Systemd Timer (Alternative)

For more reliable scheduling, you could use systemd timers instead of cron:

```bash
# Copy service file (adjust paths)
sudo cp scripts/batch-cron.service /etc/systemd/system/

# Create timer
sudo tee /etc/systemd/system/batch-cron.timer << EOF
[Unit]
Description=Run batch cron checker every 30 seconds

[Timer]
OnBootSec=30
OnUnitActiveSec=30
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable batch-cron.timer
sudo systemctl start batch-cron.timer

# Check status
sudo systemctl status batch-cron.timer
```

## Summary

- **Deploy**: Run `npm run deploy` (includes cron setup)
- **Reboot**: Cron jobs resume automatically
- **Monitor**: Check `logs/batch-cron.log`
- **Troubleshoot**: Test manually with `npm run batch:cron`
- **Maintenance**: Re-run `./scripts/setup-batch-cron.sh` if needed
