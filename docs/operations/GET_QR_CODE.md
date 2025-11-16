# How to Get WhatsApp QR Code from AWS Lambda

## Quick Method: AWS Console

1. **Open AWS Console** → CloudWatch → Log Groups
2. **Find log group**: `/aws/lambda/mnemora-birthday-bot-prod`
3. **Click on the latest log stream** (most recent timestamp)
4. **Search for**: `QR_CODE_FOR_SCANNING` or `WHATSAPP AUTHENTICATION REQUIRED`
5. **Look for the log entry** that contains:
   - `qrCode`: The QR code string
   - `qrCodeUrl`: Direct URL to QR code image

## Alternative: Use the QR Code URL

The logs will contain a URL like:
```
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=ENCODED_QR_DATA
```

Just open this URL in your browser to see the QR code!

## If QR Code Doesn't Appear

The Lambda might have timed out or errored. Try:

1. **Check Lambda execution**:
   - AWS Console → Lambda → `mnemora-birthday-bot-prod`
   - Check "Test" tab or "Monitor" tab for recent invocations
   - Look for errors

2. **Manually invoke Lambda**:
   - AWS Console → Lambda → `mnemora-birthday-bot-prod`
   - Click "Test" → Create test event → Use default `{}`
   - Click "Test" to invoke
   - Wait 30-60 seconds
   - Check CloudWatch Logs again

3. **Check for errors**:
   - Look for "FunctionError" or "Unhandled" in logs
   - Common issues:
     - Missing environment variables
     - S3 permissions
     - WhatsApp client initialization timeout

## What to Look For in Logs

The QR code will appear in logs as:

```json
{
  "level": "info",
  "msg": "QR_CODE_FOR_SCANNING",
  "qrCode": "THE_QR_CODE_STRING_HERE",
  "format": "base64"
}
```

Or:

```json
{
  "level": "warn",
  "msg": "🔐 WHATSAPP AUTHENTICATION REQUIRED - QR CODE IN LOGS",
  "qrCode": "THE_QR_CODE_STRING_HERE",
  "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=..."
}
```

## Scanning the QR Code

1. **Open WhatsApp** on your phone
2. **Go to**: Settings → Linked Devices
3. **Tap**: "Link a Device"
4. **Scan the QR code** from the logs (use the URL or generate from qrCode string)

## After Scanning

- Session will be saved to S3 automatically
- Next Lambda invocation will use the saved session (no QR code needed)
- Lambda may timeout during first auth, but session will be saved

