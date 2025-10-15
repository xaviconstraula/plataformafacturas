# VPS Setup Guide: Background Batch Processing

This guide will help you set up the background batch processing system on your Ubuntu VPS.

## Files Created/Modified

### 1. `scripts/setup-batch-checker.sh` (New)
- Automated setup script for systemd timer and service
- Tests the batch checker before setting up
- Creates and enables systemd timer

### 2. `package.json` (Modified)
- Updated deploy script to restart systemd timer after deployment

## Setup Instructions for Ubuntu VPS

### Step 1: Deploy your updated code
```bash
# On your VPS
cd /path/to/your/facturasfacil
npm run deploy
```

### Step 2: Run the setup script
```bash
# Make sure you're in the app directory
cd /path/to/your/facturasfacil

# Run the setup script (it will test and configure everything)
./scripts/setup-batch-checker.sh
```

### Step 3: Verify everything is working
```bash
# Check timer status
sudo systemctl status facturasfacil-batch-checker.timer

# Check recent service runs
sudo journalctl -u facturasfacil-batch-checker.service -n 10

# Test manually
npm run check-batches
```

## What the Setup Script Does

1. **Tests the batch checker** - Ensures your configuration works before setting up
2. **Creates systemd service** - `/etc/systemd/system/facturasfacil-batch-checker.service`
3. **Creates systemd timer** - `/etc/systemd/system/facturasfacil-batch-checker.timer`
4. **Enables and starts** the timer to run every 5 minutes

## Manual Setup (If you prefer to do it yourself)

### Create Service File
```bash
sudo nano /etc/systemd/system/facturasfacil-batch-checker.service
```

Add this content:
```ini
[Unit]
Description=FacturasFacil Invoice Batch Status Checker
After=network.target

[Service]
Type=oneshot
User=your-ubuntu-user
WorkingDirectory=/home/your-ubuntu-user/facturasfacil
ExecStart=/usr/bin/npm run check-batches
```

### Create Timer File
```bash
sudo nano /etc/systemd/system/facturasfacil-batch-checker.timer
```

Add this content:
```ini
[Unit]
Description=Run FacturasFacil batch checker every 5 minutes
Requires=facturasfacil-batch-checker.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

### Enable and Start
```bash
sudo systemctl daemon-reload
sudo systemctl enable facturasfacil-batch-checker.timer
sudo systemctl start facturasfacil-batch-checker.timer
sudo systemctl status facturasfacil-batch-checker.timer
```

## Environment Variables Required

Make sure your `.env.local` file contains:
```bash
API_SECRET_KEY=your-secure-random-key-here
# ... other required environment variables
```

## Monitoring & Troubleshooting

### Check Status
```bash
# Timer status
sudo systemctl status facturasfacil-batch-checker.timer

# Service logs
sudo journalctl -u facturasfacil-batch-checker.service -f

# Follow logs in real-time
sudo journalctl -u facturasfacil-batch-checker.service -f
```

### Common Issues

1. **Permission denied**: Make sure your user has access to the app directory
2. **npm not found**: Use full path `/usr/bin/npm`
3. **Working directory issues**: Ensure the path in the service file is correct

### Test Commands
```bash
# Test the script manually
cd /path/to/your/facturasfacil
npm run check-batches

# Check if timer is active
sudo systemctl is-active facturasfacil-batch-checker.timer

# List all timers
sudo systemctl list-timers
```

## Benefits of This Setup

- ✅ **Automatic**: Runs every 5 minutes without manual intervention
- ✅ **Survives reboots**: Systemd handles this automatically
- ✅ **Survives redeploys**: Your deploy script restarts the timer
- ✅ **Reliable**: Better than cron for production services
- ✅ **Monitorable**: Full logging and status checking
- ✅ **Maintainable**: Easy to start/stop/enable/disable

## Future Deployments

After running the initial setup, future deployments will automatically handle the timer:

```bash
npm run deploy  # This now includes restarting the timer
```

The batch processing will now work reliably even when users close their browser tabs! 🎉
