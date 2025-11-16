#!/bin/bash
# Extract WhatsApp QR code from CloudWatch Logs

set -e

LOG_GROUP="/aws/lambda/mnemora-birthday-bot-prod"
SINCE_MINUTES="${1:-15}"  # Default to 15 minutes, can be overridden

echo "=========================================="
echo "WhatsApp QR Code Extractor"
echo "=========================================="
echo ""
echo "Fetching logs from last ${SINCE_MINUTES} minutes..."
echo ""

# Check if jq is available
if command -v jq &> /dev/null; then
  USE_JQ=true
else
  USE_JQ=false
  echo "⚠️  Note: 'jq' not found. Using basic parsing (install jq for better results)."
  echo ""
fi

# Fetch logs
LOG_OUTPUT=$(aws logs tail "$LOG_GROUP" --since "${SINCE_MINUTES}m" --format json 2>/dev/null || echo "")

if [ -z "$LOG_OUTPUT" ]; then
  echo "❌ Failed to fetch logs or no logs found."
  echo ""
  echo "Troubleshooting:"
  echo "1. Check AWS credentials: aws sts get-caller-identity"
  echo "2. Verify log group exists: aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP"
  echo "3. Try invoking the Lambda first: yarn invoke:lambda"
  exit 1
fi

# Extract QR code using jq if available
if [ "$USE_JQ" = true ]; then
  # Parse JSON log events - each line is a JSON object with 'message' field
  # The message field may contain JSON strings that need to be parsed
  QR_CODE_URL=$(echo "$LOG_OUTPUT" | jq -r '.[] | select(.message != null) | try (.message | fromjson | select(.message == "QR_CODE_FOR_SCANNING") | .qrCodeUrl) catch empty' 2>/dev/null | head -1)
  QR_CODE=$(echo "$LOG_OUTPUT" | jq -r '.[] | select(.message != null) | try (.message | fromjson | select(.message == "QR_CODE_FOR_SCANNING") | .qrCode) catch empty' 2>/dev/null | head -1)
  
  # Also check for the warning message that contains qrCodeUrl
  if [ -z "$QR_CODE_URL" ]; then
    QR_CODE_URL=$(echo "$LOG_OUTPUT" | jq -r '.[] | select(.message != null) | try (.message | fromjson | select(.message | contains("AUTHENTICATION REQUIRED")) | .qrCodeUrl) catch empty' 2>/dev/null | head -1)
  fi
  
  # Fallback: if the above doesn't work, try parsing as direct JSON objects
  if [ -z "$QR_CODE_URL" ]; then
    QR_CODE_URL=$(echo "$LOG_OUTPUT" | jq -r 'select(.message == "QR_CODE_FOR_SCANNING") | .qrCodeUrl // empty' 2>/dev/null | head -1)
    QR_CODE=$(echo "$LOG_OUTPUT" | jq -r 'select(.message == "QR_CODE_FOR_SCANNING") | .qrCode // empty' 2>/dev/null | head -1)
  fi
else
  # Fallback: basic grep and sed parsing
  # Look for JSON strings in log messages
  QR_CODE_LINE=$(echo "$LOG_OUTPUT" | grep -o '"message":"QR_CODE_FOR_SCANNING"[^}]*}' | head -1)
  if [ -n "$QR_CODE_LINE" ]; then
    QR_CODE_URL=$(echo "$QR_CODE_LINE" | grep -o '"qrCodeUrl":"[^"]*"' | sed 's/"qrCodeUrl":"\([^"]*\)"/\1/' | head -1)
    QR_CODE=$(echo "$QR_CODE_LINE" | grep -o '"qrCode":"[^"]*"' | sed 's/"qrCode":"\([^"]*\)"/\1/' | head -1)
  fi
  
  # Also check for the warning message
  if [ -z "$QR_CODE_URL" ]; then
    WARN_LINE=$(echo "$LOG_OUTPUT" | grep -o '"message":"[^"]*AUTHENTICATION REQUIRED[^"]*"[^}]*}' | head -1)
    if [ -n "$WARN_LINE" ]; then
      QR_CODE_URL=$(echo "$WARN_LINE" | grep -o '"qrCodeUrl":"[^"]*"' | sed 's/"qrCodeUrl":"\([^"]*\)"/\1/' | head -1)
    fi
  fi
  
  # Also try searching in the raw log output for QR code patterns
  if [ -z "$QR_CODE_URL" ] && [ -z "$QR_CODE" ]; then
    QR_CODE_URL=$(echo "$LOG_OUTPUT" | grep -o 'https://api.qrserver.com/v1/create-qr-code/[^"]*' | head -1)
  fi
fi

# Display results
if [ -n "$QR_CODE_URL" ]; then
  echo "✅ QR Code found!"
  echo ""
  echo "📱 Scan this QR code with your WhatsApp mobile app:"
  echo ""
  echo "   $QR_CODE_URL"
  echo ""
  echo "Instructions:"
  echo "1. Open the URL above in your browser"
  echo "2. Open WhatsApp on your phone"
  echo "3. Go to Settings > Linked Devices"
  echo "4. Tap 'Link a Device'"
  echo "5. Scan the QR code from your browser"
  echo ""
  exit 0
elif [ -n "$QR_CODE" ]; then
  echo "✅ QR Code data found!"
  echo ""
  echo "📱 Generate QR code using this URL:"
  echo ""
  QR_CODE_URL="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${QR_CODE}"
  echo "   $QR_CODE_URL"
  echo ""
  echo "Instructions:"
  echo "1. Open the URL above in your browser"
  echo "2. Open WhatsApp on your phone"
  echo "3. Go to Settings > Linked Devices"
  echo "4. Tap 'Link a Device'"
  echo "5. Scan the QR code from your browser"
  echo ""
  exit 0
else
  echo "❌ No QR code found in recent logs."
  echo ""
  echo "Possible reasons:"
  echo "1. Lambda hasn't been invoked recently"
  echo "2. WhatsApp session is already authenticated"
  echo "3. QR code was generated more than ${SINCE_MINUTES} minutes ago"
  echo ""
  echo "Try:"
  echo "1. Invoke the Lambda: yarn invoke:lambda"
  echo "2. Wait a few seconds, then run this script again"
  echo "3. Check logs manually: aws logs tail $LOG_GROUP --follow"
  echo ""
  exit 1
fi

