# AWS Lambda Deployment Guide

Step-by-step guide for deploying Mnemora Birthday Bot to AWS Lambda.

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **AWS SAM CLI** installed ([Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))
4. **Node.js 20.x** and **Yarn**
5. **Google Calendar API** credentials
6. **WhatsApp** account for authentication

## Step 1: Build the Application

```bash
# Build TypeScript
yarn build

# This compiles TypeScript to JavaScript in dist/ directory
```

## Step 2: Prepare Environment Variables

Create a `samconfig.toml` file or use `sam deploy --guided` to set parameters:

```toml
[default]
[default.deploy.parameters]
stack_name = "mnemora-birthday-bot"
s3_bucket = "your-sam-bucket"
s3_prefix = "mnemora"
region = "us-east-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "Environment=prod",
  "GoogleCalendarId=your-calendar-id",
  "GoogleClientEmail=your-service-account@project.iam.gserviceaccount.com",
  "GooglePrivateKey=base64-encoded-private-key",
  "GoogleProjectId=your-project-id",
  "WhatsAppGroupId=your-whatsapp-group-name",
  "AlertEmail=your-email@example.com",
  "AlertPhone=+1234567890"
]
```

**Important**: For production, use AWS Systems Manager Parameter Store or Secrets Manager for sensitive values like `GooglePrivateKey`.

## Step 3: Deploy with SAM

```bash
# First deployment (guided)
sam deploy --guided

# Subsequent deployments
sam deploy
```

This will:
- Create S3 bucket for WhatsApp session storage
- Create SNS topic for alerts
- Create CloudWatch Log Group
- Deploy Lambda function (main + daily summary)
- Set up EventBridge rules (daily execution at 9 AM LA time, daily summary at 10 PM)
- Configure IAM roles and permissions
- Set up email/SMS subscriptions for alerts

## Step 4: Configure SNS Alerts

After deployment, configure SNS subscriptions:

1. **Check Email Subscription**:
   - Go to AWS Console → SNS → Topics → `mnemora-alerts-{env}`
   - Check Subscriptions tab
   - You should receive a confirmation email
   - **Click the confirmation link** in the email to activate

2. **Check SMS Subscription** (if phone number provided):
   - Go to AWS Console → SNS → Topics → `mnemora-alerts-{env}`
   - Check Subscriptions tab
   - SMS subscription should be active (may require verification)

3. **Test Alert**:
   - Manually trigger a Lambda error to test alert delivery
   - Or wait for the first execution to verify alerts work

**Note**: CRITICAL alerts are sent via both email and SMS. WARNING and INFO alerts are sent via email only (INFO alerts included in daily summary).

See [ALERTING_GUIDE.md](./ALERTING_GUIDE.md) for complete alert documentation.

## Step 5: Initial WhatsApp Authentication

After deployment, the first Lambda execution will require WhatsApp authentication:

1. **Trigger the Lambda function** (manually or wait for scheduled execution)
2. **Check CloudWatch Logs** for the QR code:
   - Go to CloudWatch → Log Groups → `/aws/lambda/mnemora-birthday-bot-{env}`
   - Find the log entry with `QR_CODE_FOR_SCANNING`
   - Copy the `qrCode` value
3. **Generate QR code**:
   - Use the URL provided in logs: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={qrCode}`
   - Or use any QR code generator with the code value
4. **Scan with WhatsApp**:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code
5. **Session saved**: The session will be saved to S3. Next Lambda invocation will use the saved session.

## Step 6: Set Up CloudWatch Alarms

Deploy the CloudWatch alarms:

```bash
aws cloudformation create-stack \
  --stack-name mnemora-alarms \
  --template-body file://infrastructure/cloudwatch-alarms.yaml \
  --parameters \
    ParameterKey=FunctionName,ParameterValue=mnemora-birthday-bot-prod \
    ParameterKey=LogGroupName,ParameterValue=/aws/lambda/mnemora-birthday-bot-prod
```

Or update the alarms file with your SNS topic ARN and deploy:

```bash
aws cloudformation create-stack \
  --stack-name mnemora-alarms \
  --template-body file://infrastructure/cloudwatch-alarms.yaml \
  --parameters \
    ParameterKey=FunctionName,ParameterValue=mnemora-birthday-bot-prod \
    ParameterKey=SnsTopicArn,ParameterValue=arn:aws:sns:us-east-1:123456789012:mnemora-alerts-prod \
    ParameterKey=LogGroupName,ParameterValue=/aws/lambda/mnemora-birthday-bot-prod
```

**Note**: The SNS topic ARN is available in the main stack outputs as `AlertTopicArn`.

## Step 7: Verify Deployment

1. **Check Lambda functions**: 
   - Main function: `mnemora-birthday-bot-{env}`
   - Daily summary: `mnemora-daily-summary-{env}`
2. **Check EventBridge rules**: 
   - Daily execution: `mnemora-daily-execution-{env}` (9 AM LA time)
   - Daily summary: `mnemora-daily-summary-{env}` (10 PM)
3. **Check S3 bucket**: `mnemora-whatsapp-sessions-{env}-{account-id}`
4. **Check SNS topic**: `mnemora-alerts-{env}` (with email/SMS subscriptions)
5. **Test execution**: Manually invoke the Lambda function to test
6. **Test alerts**: Verify alert delivery by checking email/SMS

## Environment Variables

The following environment variables are set automatically by the SAM template:

- `GOOGLE_CALENDAR_ID` - From parameter
- `GOOGLE_CLIENT_EMAIL` - From parameter
- `GOOGLE_PRIVATE_KEY` - From parameter
- `GOOGLE_PROJECT_ID` - From parameter
- `GOOGLE_SPREADSHEET_ID` - From parameter (optional)
- `WHATSAPP_GROUP_ID` - From parameter
- `AWS_REGION` - Automatically set
- `AWS_S3_BUCKET` - Automatically set (session storage + execution tracking)
- `AWS_CLOUDWATCH_LOG_GROUP` - Automatically set
- `AWS_XRAY_ENABLED` - Set to 'true'
- `SNS_TOPIC_ARN` - Automatically set (SNS topic for alerts)

## Local Testing

Test the Lambda function locally:

```bash
# Create test event
mkdir -p events
echo '{}' > events/event.json

# Invoke locally
sam local invoke BirthdayBotFunction --event events/event.json
```

## Troubleshooting

### Lambda Timeout
- Increase timeout in `template.yaml` (max 15 minutes)
- Check CloudWatch Logs for slow operations

### WhatsApp Authentication Issues
- Check S3 bucket for session files
- Verify IAM permissions for S3 access
- Check CloudWatch Logs for QR code

### Missing Metrics
- Verify `ENABLE_CLOUDWATCH_METRICS=true` in environment
- Check IAM permissions for CloudWatch Metrics
- Verify `METRICS_NAMESPACE` is set

### S3 Errors
- Verify IAM permissions for S3
- Check bucket name matches `AWS_S3_BUCKET` env var
- Verify bucket exists in correct region

## Cost Estimation

Approximate monthly costs (US East region, optimized for once-a-day script):

- **Lambda**: ~$0.20/month (1 execution/day, 512MB, 5 min avg) + ~$0.01/month (daily summary)
- **S3**: ~$0.01/month (session storage + execution tracking - tiny files)
- **CloudWatch Logs**: ~$0.50/month (30-day retention)
- **CloudWatch Metrics**: ~$0.10/month (custom metrics)
- **EventBridge**: Free (first 1M events/month)
- **SNS**: ~$0.01/month (email alerts, SMS costs $0.00645 per message for CRITICAL alerts)

**Total**: ~$0.83/month (without SMS), ~$0.85/month (with occasional SMS alerts)

**Note**: DynamoDB was removed - using S3 instead (much cheaper for once-a-day script! No need for fast queries when it only runs once per day.)

## Security Best Practices

1. **Use Secrets Manager** for sensitive values (Google Private Key)
2. **Enable encryption** for S3 bucket (KMS)
3. **Use least privilege IAM roles**
4. **Enable VPC** if accessing private resources
5. **Rotate credentials** regularly
6. **Secure SNS subscriptions**: Verify email/SMS subscriptions are confirmed
7. **Monitor alert costs**: SMS alerts cost $0.00645 per message (only for CRITICAL alerts)

## Updating the Deployment

```bash
# Make code changes
yarn build

# Deploy updates
sam deploy
```

## Rollback

If deployment fails:

```bash
# Delete the stack
aws cloudformation delete-stack --stack-name mnemora-birthday-bot-prod

# Or use SAM
sam delete --stack-name mnemora-birthday-bot-prod
```

## Next Steps

- Set up CloudWatch Dashboard (see MONITORING.md)
- Review alert types and severity levels (see ALERTING_GUIDE.md)
- Verify SNS email/SMS subscriptions are confirmed
- Set up CI/CD pipeline
- Migrate to WhatsApp Cloud API (see MIGRATION_GUIDE.md)

