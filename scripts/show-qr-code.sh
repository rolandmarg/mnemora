#!/bin/bash
# Display WhatsApp QR code from CloudWatch logs in terminal

set -u

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Allow override via environment variables
LOG_GROUP="${LOG_GROUP:-/aws/lambda/mnemora-birthday-bot-prod}"
REGION="${REGION:-us-west-1}"

# Get the latest QR code from logs
QR_JSON=$(aws logs filter-log-events \
  --log-group-name "${LOG_GROUP}" \
  --region "${REGION}" \
  --filter-pattern "QR_CODE_FOR_SCANNING" \
  --max-items 1 \
  --query 'events[0].message' \
  --output text 2>/dev/null || echo "")

# Check if we got a valid response
if [ -z "${QR_JSON}" ] || [ "${QR_JSON}" = "None" ] || [ "${QR_JSON}" = "null" ]; then
  echo "❌ No QR code found in logs. Make sure the Lambda function has been invoked recently."
  echo ""
  echo "To trigger the Lambda and generate a QR code, run:"
  echo "  yarn invoke:lambda"
  exit 1
fi

# Extract QR code from JSON using Node.js (with better error handling)
set +e
QR_CODE=$(cd "${PROJECT_ROOT}" && node -e "
  try {
    const msg = process.argv[1];
    if (!msg || msg === 'None' || msg === 'null' || msg.trim() === '') {
      console.error('Invalid message');
      process.exit(1);
    }
    // Extract JSON from log message
    // The log format is: timestamp\trequestId\tlevel\tJSON\n
    // Find the JSON object (starts with { and ends with })
    const jsonStart = msg.indexOf('{');
    if (jsonStart === -1) {
      console.error('No JSON object found in message');
      process.exit(1);
    }
    // Find the matching closing brace
    let braceCount = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < msg.length; i++) {
      if (msg[i] === '{') braceCount++;
      if (msg[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    if (jsonEnd === -1) {
      console.error('Incomplete JSON object');
      process.exit(1);
    }
    const jsonStr = msg.substring(jsonStart, jsonEnd);
    const data = JSON.parse(jsonStr);
    if (data && data.qrCode && typeof data.qrCode === 'string') {
      console.log(data.qrCode);
    } else {
      console.error('No qrCode field in JSON');
      process.exit(1);
    }
  } catch (e) {
    console.error('JSON parse error:', e.message);
    process.exit(1);
  }
" "${QR_JSON}" 2>&1)
EXIT_CODE=$?
set -e

# Check if extraction was successful
if [ ${EXIT_CODE} -ne 0 ] || [ -z "${QR_CODE}" ]; then
  echo "❌ Failed to extract QR code from log message."
  if [ -n "${QR_CODE}" ]; then
    echo "   Error: ${QR_CODE}"
  fi
  echo "   Log message preview: ${QR_JSON:0:200}..."
  exit 1
fi

# Display QR code in terminal using shared utility
echo ""
echo "📱 WhatsApp QR Code (scan with your phone):"
echo ""
cd "${PROJECT_ROOT}" && node -e "const { displayQRCode } = require('./dist/utils/qr-code.util.js'); displayQRCode(process.argv[1]);" "${QR_CODE}"
echo ""
echo "Instructions:"
echo "1. Open WhatsApp on your phone"
echo "2. Go to Settings > Linked Devices"
echo "3. Tap 'Link a Device'"
echo "4. Scan the QR code above"
echo ""

