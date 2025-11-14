# Quick Start: AWS Deployment

This is a quick reference guide for deploying Mnemora to AWS Lambda.

## Prerequisites Check

✅ **AWS CLI**: Configured (Account: 845641743616)  
✅ **SAM CLI**: Installed  
✅ **Build**: Successful  

## Deployment Steps

### 1. Build the Application

```bash
yarn build
```

### 2. Build with SAM

```bash
sam build
```

This packages the Lambda function code.

### 3. Deploy (Guided - First Time)

```bash
sam deploy --guided
```

You'll be prompted for:
- **Stack Name**: `mnemora-birthday-bot-prod` (or `-dev` for development)
- **AWS Region**: `us-east-1` (or your preferred region)
- **Parameter GoogleCalendarId**: Your Google Calendar ID
- **Parameter GoogleClientEmail**: Service account email
- **Parameter GooglePrivateKey**: Base64-encoded private key
- **Parameter GoogleProjectId**: Google Cloud project ID
- **Parameter WhatsAppGroupId**: WhatsApp group name (e.g., "test bot")
- **Parameter AlertEmail**: Your email for alerts
- **Parameter AlertPhone**: Optional phone number for SMS alerts
- **Confirm changes**: Yes
- **Allow SAM CLI IAM role creation**: Yes
- **Disable rollback**: No
- **Save arguments to configuration file**: Yes (creates `samconfig.toml`)

### 4. Subsequent Deployments

After first deployment, you can use:

```bash
sam deploy
```

It will use the saved configuration from `samconfig.toml`.

## Important Notes

### Google Private Key Encoding

The `GooglePrivateKey` parameter expects a **base64-encoded** private key.

To encode your private key:
```bash
# If your private key is in a file
cat path/to/private-key.json | jq -r '.private_key' | base64

# Or if you have the key directly
echo "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" | base64
```

### WhatsApp Authentication

After first deployment:
1. Lambda will run and require WhatsApp authentication
2. Check CloudWatch Logs for QR code
3. Scan QR code with WhatsApp mobile app
4. Session will be saved to S3 automatically

### SNS Email Confirmation

After deployment:
1. Check your email for SNS subscription confirmation
2. **Click the confirmation link** to activate email alerts
3. SMS alerts (if configured) may require phone verification

## Verify Deployment

```bash
# Check stack status
aws cloudformation describe-stacks --stack-name mnemora-birthday-bot-prod

# Check Lambda function
aws lambda get-function --function-name mnemora-birthday-bot-prod

# Check EventBridge rules
aws events list-rules --name-prefix mnemora-daily-execution-prod
```

## Manual Lambda Invocation (Testing)

```bash
# Invoke manually to test
aws lambda invoke \
  --function-name mnemora-birthday-bot-prod \
  --payload '{}' \
  response.json

# Check response
cat response.json
```

## View Logs

```bash
# Tail CloudWatch Logs
aws logs tail /aws/lambda/mnemora-birthday-bot-prod --follow
```

## Troubleshooting

### Build Errors
- Ensure `yarn build` completed successfully
- Check `dist/` directory has compiled JavaScript

### Deployment Errors
- Verify AWS credentials: `aws sts get-caller-identity`
- Check IAM permissions for CloudFormation, Lambda, S3, SNS
- Ensure region is correct

### Runtime Errors
- Check CloudWatch Logs for detailed error messages
- Verify environment variables are set correctly
- Check IAM role permissions

## Next Steps

1. **Confirm SNS email subscription** (check your email)
2. **Authenticate WhatsApp** (check CloudWatch Logs for QR code)
3. **Set up CloudWatch Alarms** (see `infrastructure/cloudwatch-alarms.yaml`)
4. **Monitor first execution** (scheduled for 9 AM LA time daily)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete documentation.

