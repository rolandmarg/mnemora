# Mnemora AWS Deployment Playbooks

Quick reference guide with useful links, CLI commands, and helpers for managing the deployed infrastructure.

## Table of Contents

1. [AWS Console Links](#aws-console-links)
2. [CLI Commands](#cli-commands)
3. [Monitoring & Debugging](#monitoring--debugging)
4. [Common Tasks](#common-tasks)
5. [Troubleshooting](#troubleshooting)
6. [Useful Scripts](#useful-scripts)

---

## AWS Console Links

### Quick Access (Replace `us-west-1` with your region if different)

**Lambda Functions:**
- Main Function: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod
- Daily Summary: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-daily-summary-prod

**CloudWatch Logs:**
- Main Logs: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod

**S3 Bucket:**
- Session Storage: https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-845641743616?region=us-west-1&tab=objects

**SNS Topic:**
- Alerts Topic: https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/topic/arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod

**EventBridge Rules:**
- Daily Execution: https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules/mnemora-daily-execution-prod
- Daily Summary: https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules/mnemora-daily-summary-prod

**CloudFormation Stack:**
- Stack: https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:845641743616:stack%2Fmnemora-birthday-bot-prod

**CloudWatch Metrics:**
- Custom Metrics: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=Mnemora/BirthdayBot/prod

**X-Ray Tracing:**
- Service Map: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:traces

---

## CLI Commands

### Stack Management

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Stacks[0].StackStatus' \
  --output text

# View stack outputs (bucket names, ARNs, etc.)
aws cloudformation describe-stacks \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Stacks[0].Outputs'

# View stack events (recent failures, updates)
aws cloudformation describe-stack-events \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --max-items 20

# Delete stack (careful!)
aws cloudformation delete-stack \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1
```

### Lambda Functions

```bash
# Get function details
aws lambda get-function \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1

# Invoke function manually (for testing)
aws lambda invoke \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --payload '{}' \
  /dev/stdout | cat

# View function configuration
aws lambda get-function-configuration \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1

# Update function code (after code changes)
sam build && sam deploy
```

### CloudWatch Logs

```bash
# Tail logs in real-time (follow mode)
aws logs tail /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --follow

# Get recent logs (last 100 lines)
aws logs tail /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1

# Search logs for specific text
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "ERROR" \
  --max-items 50

# Get logs from specific time range
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --start-time $(date -u -v-1H +%s)000 \
  --end-time $(date -u +%s)000

# Export logs to file
aws logs tail /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --since 1h > logs-$(date +%Y%m%d-%H%M%S).log
```

### S3 Bucket

```bash
# List files in session bucket
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/ \
  --region us-west-1 \
  --recursive

# Download WhatsApp session (for backup)
aws s3 cp s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  ./backup-session/ \
  --region us-west-1 \
  --recursive

# Upload session (restore from backup)
aws s3 cp ./backup-session/ \
  s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive

# Check execution tracking files
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/executions/ \
  --region us-west-1

# View last run date
aws s3 cp s3://mnemora-whatsapp-sessions-prod-845641743616/last-run.txt \
  - \
  --region us-west-1
```

### SNS (Alerts)

```bash
# List SNS topics
aws sns list-topics \
  --region us-west-1 \
  --query 'Topics[?contains(TopicArn, `mnemora`)]'

# Get topic subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod \
  --region us-west-1

# Send test alert
aws sns publish \
  --topic-arn arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod \
  --region us-west-1 \
  --subject "Test Alert" \
  --message "This is a test alert from Mnemora"

# Check subscription status (pending confirmation?)
aws sns get-subscription-attributes \
  --subscription-arn <subscription-arn> \
  --region us-west-1
```

### EventBridge (Schedules)

```bash
# List EventBridge rules
aws events list-rules \
  --name-prefix mnemora \
  --region us-west-1

# Get rule details
aws events describe-rule \
  --name mnemora-daily-execution-prod \
  --region us-west-1

# List targets for a rule
aws events list-targets-by-rule \
  --rule mnemora-daily-execution-prod \
  --region us-west-1

# Enable/disable a rule
aws events enable-rule \
  --name mnemora-daily-execution-prod \
  --region us-west-1

aws events disable-rule \
  --name mnemora-daily-execution-prod \
  --region us-west-1
```

### CloudWatch Metrics

```bash
# List custom metrics
aws cloudwatch list-metrics \
  --namespace Mnemora/BirthdayBot/prod \
  --region us-west-1

# Get metric statistics (last 24 hours)
aws cloudwatch get-metric-statistics \
  --namespace Mnemora/BirthdayBot/prod \
  --metric-name execution.completed \
  --dimensions Name=Date,Value=$(date +%Y-%m-%d) \
  --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --region us-west-1
```

---

## Monitoring & Debugging

### Check Deployment Status

```bash
# Quick status check
aws cloudformation describe-stacks \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Stacks[0].[StackStatus,StackStatusReason]' \
  --output table
```

### View Recent Errors

```bash
# Get failed stack events
aws cloudformation describe-stack-events \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --max-items 50 \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`]' \
  --output table
```

### Monitor Lambda Execution

```bash
# Watch logs in real-time
aws logs tail /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --follow

# Check for errors in last hour
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "ERROR" \
  --start-time $(date -u -v-1H +%s)000
```

### Check WhatsApp Authentication Status

```bash
# Look for QR code in logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "QR_CODE" \
  --max-items 10

# Check if session exists in S3
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive
```

### Verify SNS Subscriptions

```bash
# Check if email subscription is confirmed
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod \
  --region us-west-1 \
  --query 'Subscriptions[?Protocol==`email`]'
```

---

## Common Tasks

### Update Code After Changes

```bash
# 1. Build
yarn build

# 2. Build with SAM
sam build

# 3. Deploy
sam deploy
```

### Manually Trigger Birthday Check

```bash
# Invoke Lambda manually (outputs to console)
aws lambda invoke \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --payload '{}' \
  /dev/stdout | cat
```

### Backup WhatsApp Session

```bash
# Create backup directory
mkdir -p backups/session-$(date +%Y%m%d)

# Download session
aws s3 sync \
  s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  ./backups/session-$(date +%Y%m%d)/ \
  --region us-west-1
```

### Restore WhatsApp Session

```bash
# Upload from backup
aws s3 sync \
  ./backups/session-YYYYMMDD/ \
  s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  --region us-west-1
```

### Check Execution History

```bash
# List execution records
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/executions/ \
  --region us-west-1

# View today's execution record
aws s3 cp \
  s3://mnemora-whatsapp-sessions-prod-845641743616/executions/$(date +%Y-%m-%d).json \
  - \
  --region us-west-1 | jq .
```

### View Message Logs

```bash
# List message logs
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/messages/ \
  --region us-west-1 \
  --recursive

# View today's messages
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/messages/$(date +%Y-%m-%d)/ \
  --region us-west-1
```

### Test Alert System

```bash
# Send test alert
aws sns publish \
  --topic-arn arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod \
  --region us-west-1 \
  --subject "[Mnemora TEST] Test Alert" \
  --message '{"type":"test","severity":"info","title":"Test Alert","description":"This is a test"}'
```

### Temporarily Disable Daily Execution

```bash
# Disable EventBridge rule
aws events disable-rule \
  --name mnemora-daily-execution-prod \
  --region us-west-1

# Re-enable later
aws events enable-rule \
  --name mnemora-daily-execution-prod \
  --region us-west-1
```

---

## Troubleshooting

### Lambda Timeout

```bash
# Check function timeout setting
aws lambda get-function-configuration \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Timeout'

# Increase timeout (edit infrastructure/template.yaml, then redeploy)
# Current: 900 seconds (15 minutes)
# Max: 900 seconds
```

### WhatsApp Authentication Issues

```bash
# 1. Check if session exists
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive

# 2. Look for QR code in logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "QR_CODE" \
  --max-items 5

# 3. Delete session to force re-authentication
aws s3 rm s3://mnemora-whatsapp-sessions-prod-845641743616/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive

# 4. Manually trigger to get new QR code
aws lambda invoke \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --payload '{}' \
  /dev/null
```

### Missing Metrics

```bash
# Check if metrics are being published
aws cloudwatch list-metrics \
  --namespace Mnemora/BirthdayBot/prod \
  --region us-west-1

# Check Lambda environment variables
aws lambda get-function-configuration \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Environment.Variables'
```

### SNS Email Not Received

```bash
# Check subscription status
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod \
  --region us-west-1 \
  --query 'Subscriptions[?Protocol==`email`]'

# If status is "PendingConfirmation", check email for confirmation link
# Resend confirmation (if needed)
aws sns confirm-subscription \
  --topic-arn arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod \
  --token <confirmation-token> \
  --region us-west-1
```

### High Costs

```bash
# Check Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=mnemora-birthday-bot-prod \
  --start-time $(date -u -v-7d +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum \
  --region us-west-1

# Check S3 storage
aws s3 ls s3://mnemora-whatsapp-sessions-prod-845641743616/ \
  --region us-west-1 \
  --recursive \
  --summarize \
  --human-readable
```

---

## Useful Scripts

### Quick Status Check

```bash
#!/bin/bash
# Save as: scripts/check-status.sh

STACK_NAME="mnemora-birthday-bot-prod"
REGION="us-west-1"

echo "=== Stack Status ==="
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].StackStatus' \
  --output text

echo -e "\n=== Lambda Functions ==="
aws lambda list-functions \
  --region $REGION \
  --query 'Functions[?contains(FunctionName, `mnemora`)].FunctionName' \
  --output table

echo -e "\n=== Recent Log Errors ==="
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region $REGION \
  --filter-pattern "ERROR" \
  --max-items 5 \
  --query 'events[*].message' \
  --output text
```

### Get QR Code from Logs

```bash
#!/bin/bash
# Save as: scripts/get-qr-code.sh

REGION="us-west-1"

echo "Searching for QR code in logs..."
QR_CODE=$(aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region $REGION \
  --filter-pattern "QR_CODE" \
  --max-items 1 \
  --query 'events[0].message' \
  --output text | grep -oP 'qrCode["\s:]+"\K[^"]+')

if [ -n "$QR_CODE" ]; then
  echo "QR Code found!"
  echo "Generate QR code at: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=$QR_CODE"
  echo "Or scan this value: $QR_CODE"
else
  echo "No QR code found. Trigger Lambda to generate one."
fi
```

### Monitor Deployment

```bash
#!/bin/bash
# Save as: scripts/monitor-deployment.sh

STACK_NAME="mnemora-birthday-bot-prod"
REGION="us-west-1"

echo "Monitoring deployment..."
while true; do
  STATUS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null)
  
  echo "$(date): $STATUS"
  
  if [[ "$STATUS" == *"COMPLETE"* ]] || [[ "$STATUS" == *"FAILED"* ]]; then
    break
  fi
  
  sleep 5
done

echo "Deployment finished with status: $STATUS"
```

---

## Environment Variables Reference

Replace these in commands as needed:
- `REGION`: `us-west-1`
- `STACK_NAME`: `mnemora-birthday-bot-prod`
- `FUNCTION_NAME`: `mnemora-birthday-bot-prod`
- `BUCKET_NAME`: `mnemora-whatsapp-sessions-prod-845641743616`
- `SNS_TOPIC_ARN`: `arn:aws:sns:us-west-1:845641743616:mnemora-alerts-prod`
- `ACCOUNT_ID`: `845641743616`

---

## Quick Links Generator

Run this to generate all console links for your account:

```bash
#!/bin/bash
REGION="us-west-1"
ACCOUNT_ID="845641743616"

echo "Lambda Functions:"
echo "  Main: https://${REGION}.console.aws.amazon.com/lambda/home?region=${REGION}#/functions/mnemora-birthday-bot-prod"
echo "  Summary: https://${REGION}.console.aws.amazon.com/lambda/home?region=${REGION}#/functions/mnemora-daily-summary-prod"
echo ""
echo "CloudWatch Logs:"
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252Fmnemora-birthday-bot-prod"
echo ""
echo "S3 Bucket:"
echo "  https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-${ACCOUNT_ID}?region=${REGION}"
```

---

## Cost Monitoring

```bash
# Estimate monthly costs
echo "Lambda: ~\$0.20/month (1 execution/day)"
echo "S3: ~\$0.01/month"
echo "CloudWatch Logs: ~\$0.50/month"
echo "CloudWatch Metrics: ~\$0.10/month"
echo "SNS: ~\$0.01/month"
echo "Total: ~\$0.83/month"
```

---

**Last Updated**: $(date)
**Region**: us-west-1
**Stack**: mnemora-birthday-bot-prod

