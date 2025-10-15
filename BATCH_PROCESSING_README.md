# Background Batch Processing Setup

## Problem

Previously, invoice batch processing relied entirely on client-side polling. When users uploaded large batches (e.g., 600 invoices) and closed their browser tab, the batches would continue processing on Gemini's servers, but the results wouldn't be ingested into your database until the user returned and the client resumed polling.

## Solution

We've implemented a background batch processing system that works independently of client connections. This ensures batches complete processing even when users close their browser tabs.

## Components Added

### 1. Background Batch Status Checker (`lib/actions/invoices.ts`)
- `checkAndUpdateBatchStatuses()`: Checks all active batches and updates their status
- Runs independently of user sessions

### 2. API Endpoint (`app/api/batch-checker/route.ts`)
- HTTP endpoint for external monitoring systems
- Protected by `API_SECRET_KEY` environment variable
- Can be called by cron jobs or monitoring services

### 3. Cron Job Script (`scripts/check-batch-status.ts`)
- Standalone script for direct execution
- Can be run manually or via cron jobs

## Setup Instructions

### Option 1: Cron Job (Recommended for VPS)

1. **Add to crontab** (run every 5 minutes):
   ```bash
   # Edit crontab
   crontab -e

   # Add this line (replace /path/to/your/app with your actual app path)
   */5 * * * * cd /path/to/your/app && npm run check-batches
   ```

2. **Using the direct script** (alternative):
   ```bash
   # Edit crontab
   crontab -e

   # Add this line (replace /path/to/your/app with your actual app path)
   */5 * * * * cd /path/to/your/app && npx tsx scripts/check-batch-status.ts
   ```

### Option 2: External Monitoring Service

If you prefer using an external service like Cronitor, UptimeRobot, or similar:

1. **Set up the API endpoint**:
   - Ensure `API_SECRET_KEY` is set in your environment variables
   - The endpoint is available at: `https://yourdomain.com/api/batch-checker`

2. **Configure the monitoring service**:
   - URL: `https://yourdomain.com/api/batch-checker`
   - Method: GET
   - Headers: `Authorization: Bearer YOUR_API_SECRET_KEY`
   - Schedule: Every 5 minutes

### Option 3: Systemd Timer (Linux VPS)

Create a systemd service and timer for more reliable execution:

1. **Create service file** (`/etc/systemd/system/batch-checker.service`):
   ```ini
   [Unit]
   Description=Invoice Batch Status Checker
   After=network.target

   [Service]
   Type=oneshot
   User=your-user
   WorkingDirectory=/path/to/your/app
   ExecStart=/usr/bin/npm run check-batches
   ```

2. **Create timer file** (`/etc/systemd/system/batch-checker.timer`):
   ```ini
   [Unit]
   Description=Run batch checker every 5 minutes
   Requires=batch-checker.service

   [Timer]
   OnCalendar=*:0/5
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

3. **Enable and start the timer**:
   ```bash
   sudo systemctl enable batch-checker.timer
   sudo systemctl start batch-checker.timer
   ```

## Environment Variables

Add this to your `.env.local` file:

```bash
# Required for API endpoint security
API_SECRET_KEY=your-secure-random-key-here
```

## Testing

### Manual Testing

1. **Upload a batch of invoices**
2. **Close the browser tab immediately**
3. **Wait a few minutes**
4. **Run the batch checker manually**:
   ```bash
   npm run check-batches
   ```
5. **Check the database/logs** to confirm batches were processed

### Verify Cron Job Setup

```bash
# Check if cron job is running
crontab -l

# Check system logs for cron execution
grep "batch-checker" /var/log/syslog

# Or check application logs for batch processing activity
```

## Monitoring

The batch checker will log its activity:

```
[Batch Status Checker] Starting batch status check...
[checkAndUpdateBatchStatuses] Starting batch status check...
[checkAndUpdateBatchStatuses] Completed batch batch-id-123
[checkAndUpdateBatchStatuses] Finished. Processed 3 batches, 2 completed.
[Batch Status Checker] ✅ Completed successfully:
  - Processed batches: 3
  - Newly completed: 2
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Ensure the cron job user has access to the application directory
2. **Node/npm not found**: Use absolute paths or ensure PATH is set correctly
3. **Database connection issues**: Ensure environment variables are available to the cron job

### Debug Mode

Run with verbose logging:
```bash
DEBUG=* npm run check-batches
```

### Health Check

Test the API endpoint manually:
```bash
curl -H "Authorization: Bearer YOUR_API_SECRET_KEY" https://yourdomain.com/api/batch-checker
```

Expected response:
```json
{
  "success": true,
  "processedBatches": 2,
  "completedBatches": 1,
  "message": "Processed 2 batches, 1 newly completed"
}
```

## Benefits

- ✅ **Reliability**: Batches complete even when users close browser tabs
- ✅ **Performance**: Server-side processing reduces client-side load
- ✅ **Scalability**: Can handle large batches without client dependency
- ✅ **Monitoring**: Easy to monitor and alert on batch processing status
- ✅ **Flexibility**: Multiple setup options (cron, systemd, external services)
