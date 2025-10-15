#!/bin/bash

# Setup script for Invoice Batch Status Checker
# This script should be run on your Ubuntu VPS after deployment

set -e

echo "🚀 Setting up Invoice Batch Status Checker..."

# Get the current directory (should be the app root)
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="facturasfacil-batch-checker"

echo "📁 App directory: $APP_DIR"

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
    echo "❌ Please run this script as your regular user, not root"
    echo "   Usage: ./scripts/setup-batch-checker.sh"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js first."
    exit 1
fi

# Test the batch checker script
echo "🧪 Testing batch checker script..."
cd "$APP_DIR"
if npm run check-batches; then
    echo "✅ Batch checker script works!"
else
    echo "❌ Batch checker script failed. Please check your configuration."
    exit 1
fi

# Create systemd service file
echo "📝 Creating systemd service file..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=FacturasFacil Invoice Batch Status Checker
After=network.target

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm run check-batches
EOF

# Create systemd timer file
echo "⏰ Creating systemd timer file..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.timer > /dev/null << EOF
[Unit]
Description=Run FacturasFacil batch checker every 5 minutes
Requires=${SERVICE_NAME}.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Reload systemd and enable timer
echo "🔄 Reloading systemd..."
sudo systemctl daemon-reload

echo "✅ Enabling timer..."
sudo systemctl enable ${SERVICE_NAME}.timer

echo "▶️  Starting timer..."
sudo systemctl start ${SERVICE_NAME}.timer

# Show status
echo ""
echo "📊 Status:"
sudo systemctl status ${SERVICE_NAME}.timer --no-pager -l

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Useful commands:"
echo "  Check status: sudo systemctl status ${SERVICE_NAME}.timer"
echo "  View logs: sudo journalctl -u ${SERVICE_NAME}.service -f"
echo "  Stop timer: sudo systemctl stop ${SERVICE_NAME}.timer"
echo "  Disable timer: sudo systemctl disable ${SERVICE_NAME}.timer"
echo ""
echo "The batch checker will now run every 5 minutes automatically! 🎉"
