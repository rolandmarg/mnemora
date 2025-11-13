#!/bin/bash

# Installation script for launchd LaunchAgents
# Sets up daily birthday check at 9:00 AM Los Angeles time using native macOS launchd
# No external dependencies - uses only built-in macOS tools

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Installing Mnemora Birthday Bot (using native macOS launchd)..."
echo "Project directory: $PROJECT_DIR"

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

# 1. Install Bootup LaunchAgent (prompts on login)
echo ""
echo "1. Installing Bootup LaunchAgent..."

BOOTUP_PLIST_FILE="$LAUNCH_AGENTS_DIR/com.mnemora.birthday-bootup.plist"
BOOTUP_TEMPLATE="$PROJECT_DIR/scripts/com.mnemora.birthday-bootup.plist"

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCH_AGENTS_DIR"

# Replace PROJECT_DIR_PLACEHOLDER with actual project directory
sed "s|PROJECT_DIR_PLACEHOLDER|$PROJECT_DIR|g" "$BOOTUP_TEMPLATE" > "$BOOTUP_PLIST_FILE"

echo "   Bootup LaunchAgent installed: $BOOTUP_PLIST_FILE"

# Unload if already exists, then load
launchctl unload "$BOOTUP_PLIST_FILE" 2>/dev/null || true
launchctl load "$BOOTUP_PLIST_FILE" 2>/dev/null || launchctl load -w "$BOOTUP_PLIST_FILE" 2>/dev/null || true
echo "   Bootup LaunchAgent loaded"

# 2. Install Daily Schedule LaunchAgent (runs at 9 AM LA time)
echo ""
echo "2. Installing Daily Schedule LaunchAgent..."

DAILY_PLIST_FILE="$LAUNCH_AGENTS_DIR/com.mnemora.birthday-daily.plist"
DAILY_TEMPLATE="$PROJECT_DIR/scripts/com.mnemora.birthday-daily.plist"

# Replace PROJECT_DIR_PLACEHOLDER with actual project directory
sed "s|PROJECT_DIR_PLACEHOLDER|$PROJECT_DIR|g" "$DAILY_TEMPLATE" > "$DAILY_PLIST_FILE"

echo "   Daily LaunchAgent installed: $DAILY_PLIST_FILE"
echo "   Schedule: Daily at 9:00 AM Los Angeles time"

# Unload if already exists, then load
launchctl unload "$DAILY_PLIST_FILE" 2>/dev/null || true
launchctl load "$DAILY_PLIST_FILE" 2>/dev/null || launchctl load -w "$DAILY_PLIST_FILE" 2>/dev/null || true
echo "   Daily LaunchAgent loaded"

# 3. Make scripts executable
echo ""
echo "3. Making scripts executable..."
chmod +x "$PROJECT_DIR/scripts/daily-check.sh"
chmod +x "$PROJECT_DIR/scripts/bootup-prompt.sh"
chmod +x "$PROJECT_DIR/scripts/install-cron.sh"
chmod +x "$PROJECT_DIR/scripts/uninstall-cron.sh"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Summary:"
echo "  - Bootup LaunchAgent: $BOOTUP_PLIST_FILE (prompts on login)"
echo "  - Daily LaunchAgent: $DAILY_PLIST_FILE (runs daily at 9:00 AM LA time)"
echo "  - Logs: $PROJECT_DIR/logs/"
echo ""
echo "To verify LaunchAgents: launchctl list | grep mnemora"
echo "To check status: launchctl list com.mnemora.birthday-daily"
echo ""
echo "✅ Using native macOS launchd - no external dependencies!"
echo "   - Handles sleep/wake automatically"
echo "   - Native timezone support (America/Los_Angeles)"
echo "   - More reliable than cron on macOS"
