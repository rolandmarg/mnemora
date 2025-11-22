#!/bin/zsh

# Uninstallation script for launchd LaunchAgents
# Removes the daily birthday check LaunchAgents

set -e

echo "Uninstalling Mnemora Birthday Bot LaunchAgents..."

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

# 1. Unload and remove Bootup LaunchAgent
echo ""
echo "1. Removing Bootup LaunchAgent..."

BOOTUP_PLIST_FILE="$LAUNCH_AGENTS_DIR/com.mnemora.birthday-bootup.plist"

if [ -f "$BOOTUP_PLIST_FILE" ]; then
  # Unload the LaunchAgent
  launchctl unload "$BOOTUP_PLIST_FILE" 2>/dev/null || launchctl unload -w "$BOOTUP_PLIST_FILE" 2>/dev/null || true
  echo "   Bootup LaunchAgent unloaded"
  
  # Remove the plist file
  rm "$BOOTUP_PLIST_FILE"
  echo "   Bootup LaunchAgent removed: $BOOTUP_PLIST_FILE"
else
  echo "   Bootup LaunchAgent not found (already removed?)"
fi

# 2. Unload and remove Daily LaunchAgent
echo ""
echo "2. Removing Daily LaunchAgent..."

DAILY_PLIST_FILE="$LAUNCH_AGENTS_DIR/com.mnemora.birthday-daily.plist"

if [ -f "$DAILY_PLIST_FILE" ]; then
  # Unload the LaunchAgent
  launchctl unload "$DAILY_PLIST_FILE" 2>/dev/null || launchctl unload -w "$DAILY_PLIST_FILE" 2>/dev/null || true
  echo "   Daily LaunchAgent unloaded"
  
  # Remove the plist file
  rm "$DAILY_PLIST_FILE"
  echo "   Daily LaunchAgent removed: $DAILY_PLIST_FILE"
else
  echo "   Daily LaunchAgent not found (already removed?)"
fi

echo ""
echo "✅ Uninstallation complete!"
echo ""
echo "Removed:"
echo "  - Bootup LaunchAgent: $BOOTUP_PLIST_FILE"
echo "  - Daily LaunchAgent: $DAILY_PLIST_FILE"
echo ""
echo "Note: Log files in logs/ directory were not removed."

