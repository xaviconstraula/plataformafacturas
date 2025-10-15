#!/bin/bash

# Setup script for batch processing cron job on Ubuntu VPS
# This script sets up a cron job to run every 30 seconds to check batch statuses

set -e

echo "Setting up batch processing cron job..."

# Get the current directory (where the project is located)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project directory: $PROJECT_DIR"

# Create a wrapper script that sets up the environment
WRAPPER_SCRIPT="$PROJECT_DIR/scripts/run-batch-check.sh"

cat > "$WRAPPER_SCRIPT" << EOF
#!/bin/bash
# Wrapper script for batch cron checker
# Sets up environment and runs the batch checker

cd "$PROJECT_DIR"

# Set environment variables (adjust paths as needed)
export NODE_ENV=production
export PATH="/usr/local/bin:/usr/bin:/bin:\$PATH"

# Load environment variables from .env if it exists
if [ -f "$PROJECT_DIR/.env" ]; then
    export \$(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi

# Run the batch checker
npm run batch:cron >> "$PROJECT_DIR/logs/batch-cron.log" 2>&1
EOF

# Make the wrapper script executable
chmod +x "$WRAPPER_SCRIPT"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Create cron job entry
CRON_ENTRY="* * * * * $WRAPPER_SCRIPT"
CRON_ENTRY_30SEC="* * * * * sleep 30; $WRAPPER_SCRIPT"

# Add both entries to run every 30 seconds
echo "Adding cron job entries..."
(crontab -l 2>/dev/null; echo "$CRON_ENTRY"; echo "$CRON_ENTRY_30SEC") | crontab -

echo "Cron job setup complete!"
echo "The batch checker will run every 30 seconds."
echo "Logs will be written to: $PROJECT_DIR/logs/batch-cron.log"
echo ""
echo "To view logs: tail -f $PROJECT_DIR/logs/batch-cron.log"
echo "To remove cron job: crontab -e (and remove the batch checker entries)"
echo ""
echo "Current crontab:"
crontab -l
