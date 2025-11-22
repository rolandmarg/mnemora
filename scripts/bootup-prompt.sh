#!/bin/zsh

# Bootup prompt script - asks user if they want to send birthday messages now
# This script is run by LaunchAgent on user login

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${(%):-%x}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Open a new terminal window and prompt the user
# Using osascript to open Terminal and run interactive prompt
osascript <<EOF
tell application "Terminal"
  activate
  set newTab to do script "cd '$PROJECT_DIR' && echo 'Send birthday messages now? (y/n)' && read -r response && if [ \"\$response\" = \"y\" ] || [ \"\$response\" = \"Y\" ]; then yarn start; else echo 'Skipped.'; fi"
end tell
EOF

