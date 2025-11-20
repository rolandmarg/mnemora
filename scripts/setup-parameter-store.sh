#!/bin/bash
# Setup Parameter Store with current environment variable values
# This script migrates existing Lambda environment variables to Parameter Store

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENVIRONMENT="${1:-prod}"
REGION="${AWS_REGION:-us-west-1}"

if [ "$ENVIRONMENT" != "prod" ] && [ "$ENVIRONMENT" != "dev" ]; then
  echo "❌ Environment must be 'prod' or 'dev'"
  exit 1
fi

echo "=========================================="
echo "Setting up Parameter Store for Mnemora"
echo "=========================================="
echo ""
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Get current Lambda function environment variables
FUNCTION_NAME="mnemora-birthday-bot-${ENVIRONMENT}"
echo "Fetching current environment variables from Lambda function: $FUNCTION_NAME"
echo ""

ENV_VARS=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Environment.Variables' \
  --output json 2>/dev/null || echo "{}")

if [ "$ENV_VARS" = "{}" ]; then
  echo "⚠️  Could not fetch environment variables from Lambda function"
  echo "   Make sure the function exists and you have permissions"
  echo ""
  echo "   You can manually set parameters using:"
  echo "   aws ssm put-parameter --name \"/mnemora/${ENVIRONMENT}/whatsapp/groupId\" --value \"YOUR_VALUE\" --type String --overwrite"
  exit 1
fi

# Extract values using jq (if available) or manual parsing
WHATSAPP_GROUP_ID=$(echo "$ENV_VARS" | grep -o '"WHATSAPP_GROUP_ID":"[^"]*' | cut -d'"' -f4 || echo "")
SCHEDULE_TIME=$(echo "$ENV_VARS" | grep -o '"SCHEDULE_TIME":"[^"]*' | cut -d'"' -f4 || echo "09:00")
TIMEZONE=$(echo "$ENV_VARS" | grep -o '"TIMEZONE":"[^"]*' | cut -d'"' -f4 || echo "America/Los_Angeles")
LOG_LEVEL=$(echo "$ENV_VARS" | grep -o '"LOG_LEVEL":"[^"]*' | cut -d'"' -f4 || echo "info")
GOOGLE_SPREADSHEET_ID=$(echo "$ENV_VARS" | grep -o '"GOOGLE_SPREADSHEET_ID":"[^"]*' | cut -d'"' -f4 || echo "")

# Function to create or update parameter
create_parameter() {
  local name=$1
  local value=$2
  local description=$3

  if [ -z "$value" ]; then
    echo "⏭️  Skipping $name (empty value)"
    return
  fi

  echo "📝 Creating/updating: $name"
  aws ssm put-parameter \
    --name "$name" \
    --value "$value" \
    --type "String" \
    --description "$description" \
    --overwrite \
    --region "$REGION" > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo "   ✅ Set to: ${value:0:50}${value:50:+...}"
  else
    echo "   ❌ Failed to set parameter"
  fi
}

# Create parameters
echo "Creating Parameter Store parameters..."
echo ""

create_parameter "/mnemora/${ENVIRONMENT}/whatsapp/groupId" "$WHATSAPP_GROUP_ID" "WhatsApp Group ID for birthday notifications"
create_parameter "/mnemora/${ENVIRONMENT}/schedule/time" "$SCHEDULE_TIME" "Schedule time for daily birthday check (HH:MM format)"
create_parameter "/mnemora/${ENVIRONMENT}/schedule/timezone" "$TIMEZONE" "Timezone for schedule (e.g., America/Los_Angeles)"
create_parameter "/mnemora/${ENVIRONMENT}/logging/level" "$LOG_LEVEL" "Logging level (debug, info, warn, error)"

if [ -n "$GOOGLE_SPREADSHEET_ID" ]; then
  create_parameter "/mnemora/${ENVIRONMENT}/google/spreadsheetId" "$GOOGLE_SPREADSHEET_ID" "Google Spreadsheet ID for birthday data"
fi

echo ""
echo "=========================================="
echo "✅ Parameter Store setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Deploy the updated Lambda function code"
echo "2. The function will now read from Parameter Store"
echo "3. Update parameters anytime using:"
echo "   yarn update-config whatsapp.groupId \"NEW_VALUE\""
echo ""
echo "View all parameters:"
echo "   yarn update-config list"
echo ""

