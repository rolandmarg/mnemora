#!/bin/zsh

# Daily birthday check script for cron
# This script runs the birthday check and logs output

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${(%):-%x}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Log file with date
LOG_FILE="logs/cron-$(date +%Y-%m-%d).log"

# Run the birthday check and log output
echo "=== Birthday Check Started: $(date) ===" >> "$LOG_FILE"
yarn start >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "=== Birthday Check Finished: $(date) (Exit Code: $EXIT_CODE) ===" >> "$LOG_FILE"

exit $EXIT_CODE

