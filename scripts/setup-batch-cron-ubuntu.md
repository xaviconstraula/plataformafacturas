# Batch Processing Cron Job Setup for Ubuntu VPS

This guide explains how to set up a cron job to automatically check and process invoice batches every 30 seconds on your Ubuntu VPS.

## Problem

Currently, batch processing only happens when users are actively using the web interface. If a user uploads invoices and closes their browser tab, the batches won't be processed until they return to the website.

## Solution

A cron job that runs every 30 seconds to check batch statuses and process completed batches using the existing batch processing logic.

## Setup Instructions

### 1. Upload the Scripts

Make sure these files are on your Ubuntu VPS:
- `scripts/batch-cron-checker.ts` - The main cron script
- `scripts/setup-batch-cron.sh` - Setup script for Ubuntu

### 2. Run the Setup Script

On your Ubuntu VPS, navigate to your project directory and run:

```bash
chmod +x scripts/setup-batch-cron.sh
./scripts/setup-batch-cron.sh
```

This will:
- Create a wrapper script that sets up the environment
- Add cron job entries to run every 30 seconds
- Create a logs directory for monitoring

### 3. Verify the Setup

Check that the cron job was added:

```bash
crontab -l
```

You should see entries like:
```
* * * * * /path/to/your/project/scripts/run-batch-check.sh
* * * * * sleep 30; /path/to/your/project/scripts/run-batch-check.sh
```

### 4. Monitor the Logs

Watch the logs to see the cron job in action:

```bash
tail -f logs/batch-cron.log
```

## How It Works

1. **Every 30 seconds**, the cron job runs `npm run batch:cron`
2. **The script** queries the database for active batches (PENDING/PROCESSING status)
3. **For each active batch**, it checks the Gemini API for current status
4. **If a batch is completed**, it ingests the results using the existing `ingestBatchOutputFromGemini` function
5. **Updates the database** with the latest batch status and progress

## Key Features

- **DRY Principle**: Reuses existing batch processing logic from `lib/actions/invoices.ts`
- **No Authentication Required**: Runs as a system cron job, not tied to user sessions
- **Error Handling**: Includes retry logic for rate limits and API failures
- **Logging**: All activity is logged for monitoring and debugging
- **Graceful Degradation**: If the cron job fails, the web interface still works normally

## Troubleshooting

### Check if the cron job is running:

```bash
# Check cron service status
sudo systemctl status cron

# Check recent cron logs
sudo tail -f /var/log/syslog | grep CRON

# Check your application logs
tail -f logs/batch-cron.log
```

### Manual Testing:

```bash
# Test the script manually
npm run batch:cron

# Check for errors
echo $?
```

### Remove the Cron Job:

```bash
# Edit crontab
crontab -e

# Remove the batch checker entries, then save
```

## Environment Variables

Make sure these environment variables are set in your `.env` file:

```bash
GOOGLE_GENAI_API_KEY=your_api_key_here
DATABASE_URL=your_database_url_here
```

## Performance Considerations

- The cron job runs every 30 seconds, which provides good responsiveness
- It only processes active batches, so it's efficient when no batches are running
- API calls include retry logic and rate limit handling
- Database connections are properly closed after each run

## Security Notes

- The cron job runs with the same permissions as the user who set it up
- It doesn't require user authentication since it processes all users' batches
- Make sure your `.env` file has proper permissions (600) to protect API keys
