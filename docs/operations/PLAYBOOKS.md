# Mnemora AWS Deployment Playbooks

Quick reference guide with useful links, CLI commands, and helpers for managing the deployed infrastructure.

## Table of Contents

1. [Quick Reference - Most Used Links](#quick-reference---most-used-links)
2. [AWS Console Links](#aws-console-links)
3. [Useful Log Insights Queries](#useful-log-insights-queries)
4. [CLI Commands](#cli-commands)
5. [Monitoring & Debugging](#monitoring--debugging)
6. [Common Tasks](#common-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Useful Scripts](#useful-scripts)

---

## Quick Reference - Most Used Links

### When Something Goes Wrong

**Check for Errors:**
- [CloudWatch Logs - Main Function](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod)
- [Log Insights - Error Query](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights)
- [Lambda Function - Monitoring](https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/monitoring)
- [CloudWatch Alarms](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#alarmsV2:?alarmNameFilter=mnemora)

**Check Execution Status:**
- [Lambda Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=AWS/Lambda;dimensions=FunctionName~mnemora-birthday-bot-prod)
- [Custom Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=Mnemora/BirthdayBot/prod)
- [X-Ray Traces](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:traces)

**Check Recent Activity:**
- [Recent Logs](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod)
- [EventBridge Rules](https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules)

### Daily Operations

**Monitor Health:**
- [CloudWatch Dashboards](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#dashboards:)
- [All Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:metrics)
- [Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer)

**View Logs:**
- [Log Insights](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights)
- [Main Log Group](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod)

**Manage Infrastructure:**
- [CloudFormation Stack](https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:YOUR_ACCOUNT_ID:stack%2Fmnemora-birthday-bot-prod)
- [S3 Bucket](https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=objects)
- [SNS Topic](https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/topic/arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod)

---

## AWS Console Links

### Quick Access (Replace `us-west-1` with your region if different)

**Region**: `us-west-1` | **Account ID**: `YOUR_ACCOUNT_ID` | **Stack**: `mnemora-birthday-bot-prod`

---

### Lambda Functions

- **Main Function**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod
- **Main Function - Configuration**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/configuration
- **Main Function - Monitoring**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/monitoring
- **Main Function - Logs**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/monitoring/logs
- **Daily Summary Function**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-daily-summary-prod
- **Daily Summary - Monitoring**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-daily-summary-prod/monitoring

---

### CloudWatch Logs

- **Main Log Group**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod
- **Daily Summary Log Group**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-daily-summary-prod
- **All Log Groups**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups
- **Log Insights (Query Interface)**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights
- **Log Insights - Pre-configured Query (Main Function)**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights$3FqueryDetail$3D~(end~0~start~-3600~timeType~'RELATIVE~tz~'UTC~queryString~'fields*20@timestamp*2C*20@message*0A*7C*20filter*20@message*20like*20*2FERROR*2F*0A*7C*20sort*20@timestamp*20desc~source~'$252Faws$252Flambda$252Fmnemora-birthday-bot-prod)

---

### CloudWatch Metrics

- **Custom Metrics Dashboard**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=Mnemora/BirthdayBot/prod
- **All Custom Metrics**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:metrics?namespace=Mnemora/BirthdayBot/prod
- **Lambda Metrics (Main Function)**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=AWS/Lambda;dimensions=FunctionName~mnemora-birthday-bot-prod
- **Lambda Metrics (Daily Summary)**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=AWS/Lambda;dimensions=FunctionName~mnemora-daily-summary-prod
- **All Metrics**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:metrics

---

### CloudWatch Alarms

- **All Alarms**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#alarmsV2:
- **Alarms for Mnemora**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#alarmsV2:?alarmNameFilter=mnemora
- **Create New Alarm**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#alarmsV2:alarm/create

---

### CloudWatch Dashboards

- **All Dashboards**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#dashboards:
- **Create Dashboard**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#dashboards:name=

---

### X-Ray Tracing

- **Service Map**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:traces
- **Traces (All)**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:traces
- **Service Map - Filtered (Main Function)**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:traces?queryString=service(name%3D%22mnemora-birthday-bot-prod%22)
- **Analytics**: https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:analytics

---

### S3 Bucket

- **Session Storage Bucket**: https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=objects
- **Bucket Properties**: https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=properties
- **Bucket Metrics**: https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=metrics
- **Bucket Access**: https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=permissions

---

### SNS (Simple Notification Service)

- **Alerts Topic**: https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/topic/arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod
- **All Topics**: https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/topics
- **Subscriptions**: https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/subscriptions

---

### EventBridge (Scheduled Rules)

- **Daily Execution Rule**: https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules/mnemora-daily-execution-prod
- **Daily Summary Rule**: https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules/mnemora-daily-summary-prod
- **All Rules**: https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules
- **Rule Metrics**: https://us-west-1.console.aws.amazon.com/events/home?region=us-west-1#/rules/mnemora-daily-execution-prod/metrics

---

### CloudFormation

- **Main Stack**: https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:YOUR_ACCOUNT_ID:stack%2Fmnemora-birthday-bot-prod
- **Stack Events**: https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:YOUR_ACCOUNT_ID:stack%2Fmnemora-birthday-bot-prod&view=events
- **Stack Resources**: https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:YOUR_ACCOUNT_ID:stack%2Fmnemora-birthday-bot-prod&view=resources
- **Stack Outputs**: https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:YOUR_ACCOUNT_ID:stack%2Fmnemora-birthday-bot-prod&view=outputs
- **All Stacks**: https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks

---

### IAM (Identity and Access Management)

- **Lambda Execution Role**: https://us-west-1.console.aws.amazon.com/iam/home?region=us-west-1#/roles
- **All Roles**: https://us-west-1.console.aws.amazon.com/iam/home?region=us-west-1#/roles
- **Policies**: https://us-west-1.console.aws.amazon.com/iam/home?region=us-west-1#/policies

---

### Cost Management

- **Cost Explorer**: https://console.aws.amazon.com/cost-management/home#/cost-explorer
- **Billing Dashboard**: https://console.aws.amazon.com/billing/home#/
- **Budgets**: https://console.aws.amazon.com/billing/home#/budgets
- **Cost and Usage Reports**: https://console.aws.amazon.com/billing/home#/reports

---

---

### Quick Links by Category

#### For Debugging Errors
- [CloudWatch Logs - Main Function](#cloudwatch-logs)
- [Log Insights - Error Queries](#cloudwatch-logs)
- [Lambda Function - Monitoring Tab](#lambda-functions)
- [X-Ray Traces](#x-ray-tracing)
- [CloudWatch Alarms](#cloudwatch-alarms)

#### For Monitoring Metrics
- [Custom Metrics Dashboard](#cloudwatch-metrics)
- [Lambda Metrics](#cloudwatch-metrics)
- [CloudWatch Dashboards](#cloudwatch-dashboards)
- [X-Ray Analytics](#x-ray-tracing)

#### For Viewing Logs
- [Main Log Group](#cloudwatch-logs)
- [Log Insights Query Interface](#cloudwatch-logs)
- [Lambda Function Logs Tab](#lambda-functions)

#### For Infrastructure Management
- [CloudFormation Stack](#cloudformation)
- [S3 Bucket](#s3-bucket)
- [EventBridge Rules](#eventbridge-scheduled-rules)
- [IAM Roles](#iam-identity-and-access-management)

#### For Cost Monitoring
- [Cost Explorer](#cost-management)
- [Billing Dashboard](#cost-management)

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
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/ \
  --region us-west-1 \
  --recursive

# Download WhatsApp session (for backup)
aws s3 cp s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  ./backup-session/ \
  --region us-west-1 \
  --recursive

# Upload session (restore from backup)
aws s3 cp ./backup-session/ \
  s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive

# Check execution tracking files
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/executions/ \
  --region us-west-1

# View last run date
aws s3 cp s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/last-run.txt \
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
  --topic-arn arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod \
  --region us-west-1

# Send test alert
aws sns publish \
  --topic-arn arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod \
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

### Quick Links for Monitoring

**Console Links:**
- [Lambda Function Monitoring](https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/monitoring)
- [CloudWatch Metrics Dashboard](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=Mnemora/BirthdayBot/prod)
- [CloudWatch Alarms](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#alarmsV2:?alarmNameFilter=mnemora)
- [X-Ray Service Map](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#xray:traces)
- [Log Insights](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights)

### Check Deployment Status

**Console:** [CloudFormation Stack](https://us-west-1.console.aws.amazon.com/cloudformation/home?region=us-west-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:us-west-1:YOUR_ACCOUNT_ID:stack%2Fmnemora-birthday-bot-prod)

```bash
# Quick status check
aws cloudformation describe-stacks \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Stacks[0].[StackStatus,StackStatusReason]' \
  --output table
```

### View Recent Errors

**Console:** [Log Insights - Error Query](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights) | [CloudWatch Logs](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod)

```bash
# Get failed stack events
aws cloudformation describe-stack-events \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --max-items 50 \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`]' \
  --output table

# Check for errors in last hour
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "ERROR" \
  --start-time $(date -u -v-1H +%s)000
```

### Monitor Lambda Execution

**Console:** [Lambda Monitoring Tab](https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/monitoring) | [Lambda Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=AWS/Lambda;dimensions=FunctionName~mnemora-birthday-bot-prod)

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

**Console:** [S3 Bucket](https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=objects) | [Log Insights - WhatsApp Auth Query](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights)

```bash
# Look for QR code in logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "QR_CODE" \
  --max-items 10

# Check if session exists in S3
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive
```

### Verify SNS Subscriptions

**Console:** [SNS Topic](https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/topic/arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod) | [All Subscriptions](https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/subscriptions)

```bash
# Check if email subscription is confirmed
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod \
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
  s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  ./backups/session-$(date +%Y%m%d)/ \
  --region us-west-1
```

### Restore WhatsApp Session

```bash
# Upload from backup
aws s3 sync \
  ./backups/session-YYYYMMDD/ \
  s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  --region us-west-1
```

### Check Execution History

```bash
# List execution records
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/executions/ \
  --region us-west-1

# View today's execution record
aws s3 cp \
  s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/executions/$(date +%Y-%m-%d).json \
  - \
  --region us-west-1 | jq .
```

### View Message Logs

```bash
# List message logs
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/messages/ \
  --region us-west-1 \
  --recursive

# View today's messages
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/messages/$(date +%Y-%m-%d)/ \
  --region us-west-1
```

### Test Alert System

```bash
# Send test alert
aws sns publish \
  --topic-arn arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod \
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

**Console:** [Lambda Function Configuration](https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/configuration) | [Lambda Monitoring](https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/monitoring)

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

**Console:** [S3 Bucket](https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=objects) | [CloudWatch Logs](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-birthday-bot-prod) | [Log Insights](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:logs-insights)

```bash
# 1. Check if session exists
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive

# 2. Look for QR code in logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/mnemora-birthday-bot-prod \
  --region us-west-1 \
  --filter-pattern "QR_CODE" \
  --max-items 5

# 3. Display QR code in terminal (simplest method)
yarn show-qr-code

# Or run directly:
# ./scripts/show-qr-code.sh

# Alternative: If you need to specify a different region or log group
# LOG_GROUP="/aws/lambda/mnemora-birthday-bot-prod" REGION="us-west-1" yarn show-qr-code

# 4. Delete session to force re-authentication
aws s3 rm s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/.wwebjs_auth/ \
  --region us-west-1 \
  --recursive

# 5. Manually trigger to get new QR code
aws lambda invoke \
  --function-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --payload '{}' \
  /dev/null
```

### Missing Metrics

**Console:** [Custom Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=Mnemora/BirthdayBot/prod) | [All Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:metrics?namespace=Mnemora/BirthdayBot/prod) | [Lambda Configuration](https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-birthday-bot-prod/configuration)

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

**Console:** [SNS Topic](https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/topic/arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod) | [Subscriptions](https://us-west-1.console.aws.amazon.com/sns/v3/home?region=us-west-1#/subscriptions)

```bash
# Check subscription status
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod \
  --region us-west-1 \
  --query 'Subscriptions[?Protocol==`email`]'

# If status is "PendingConfirmation", check email for confirmation link
# Resend confirmation (if needed)
aws sns confirm-subscription \
  --topic-arn arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod \
  --token <confirmation-token> \
  --region us-west-1
```

### High Costs

**Console:** [Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer) | [Billing Dashboard](https://console.aws.amazon.com/billing/home#/) | [Lambda Metrics](https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#metricsV2:graph=~();namespace=AWS/Lambda;dimensions=FunctionName~mnemora-birthday-bot-prod) | [S3 Bucket](https://s3.console.aws.amazon.com/s3/buckets/mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID?region=us-west-1&tab=metrics)

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
aws s3 ls s3://mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID/ \
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
- `BUCKET_NAME`: `mnemora-whatsapp-sessions-prod-YOUR_ACCOUNT_ID`
- `SNS_TOPIC_ARN`: `arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:mnemora-alerts-prod`
- `ACCOUNT_ID`: `YOUR_ACCOUNT_ID`

---

## Useful Log Insights Queries

### Pre-configured Queries

Copy these queries into CloudWatch Log Insights for quick analysis:

#### Error Analysis

**All Errors (Last Hour)**:
```
fields @timestamp, @message
| filter @message like /ERROR/ or @message like /Error/ or @message like /error/
| sort @timestamp desc
| limit 100
```

**Errors with Stack Traces**:
```
fields @timestamp, @message
| filter @message like /ERROR/ or @message like /Error/
| filter @message like /at / or @message like /Stack/
| sort @timestamp desc
```

**Error Rate Over Time**:
```
fields @timestamp
| filter @message like /ERROR/ or @message like /Error/
| stats count() as error_count by bin(5m)
| sort @timestamp desc
```

#### Execution Tracking

**Daily Execution Count**:
```
fields @timestamp, @message
| filter @message like /execution.completed/ or @message like /execution.started/
| stats count() by bin(1d)
| sort @timestamp desc
```

**Execution Duration**:
```
fields @timestamp, @message
| filter @message like /execution.duration/
| parse @message /duration:\s*(?<duration>\d+)/
| stats avg(duration), max(duration), min(duration) by bin(1h)
```

**Failed Executions**:
```
fields @timestamp, @message
| filter @message like /execution.failed/
| sort @timestamp desc
| limit 50
```

#### WhatsApp Operations

**WhatsApp Authentication Events**:
```
fields @timestamp, @message
| filter @message like /QR_CODE/ or @message like /whatsapp.auth/ or @message like /authentication/
| sort @timestamp desc
```

**WhatsApp Message Events**:
```
fields @timestamp, @message
| filter @message like /whatsapp.messages/ or @message like /Message sent/ or @message like /Message failed/
| sort @timestamp desc
```

**WhatsApp Errors**:
```
fields @timestamp, @message
| filter @message like /whatsapp/ and (@message like /ERROR/ or @message like /Error/ or @message like /failed/)
| sort @timestamp desc
```

#### Birthday Operations

**Birthday Fetching**:
```
fields @timestamp, @message
| filter @message like /birthdays.fetched/ or @message like /birthday/ or @message like /Birthday/
| sort @timestamp desc
```

**Birthday Messages Sent**:
```
fields @timestamp, @message
| filter @message like /birthdays.sent/ or @message like /birthday message/
| stats count() by bin(1d)
```

**Monthly Digest Events**:
```
fields @timestamp, @message
| filter @message like /monthly_digest/ or @message like /Monthly digest/
| sort @timestamp desc
```

#### Performance Analysis

**Slow Operations**:
```
fields @timestamp, @message
| filter @message like /duration/ or @message like /took/
| parse @message /(?<duration>\d+)\s*(ms|milliseconds|seconds)/
| filter duration > 1000
| sort duration desc
```

**API Call Tracking**:
```
fields @timestamp, @message
| filter @message like /api.calendar/ or @message like /api.sheets/ or @message like /API call/
| stats count() by bin(1h)
```

#### Correlation ID Tracking

**Trace Specific Execution**:
```
fields @timestamp, @message
| filter correlationId = "YOUR_CORRELATION_ID_HERE"
| sort @timestamp asc
```

**All Correlation IDs (Last 24h)**:
```
fields @timestamp, @message, correlationId
| filter ispresent(correlationId)
| stats count() by correlationId
| sort count desc
```

#### General Health Check

**All Metrics in Logs**:
```
fields @timestamp, @message
| filter @message like /metric/ or @message like /Metric/
| sort @timestamp desc
| limit 100
```

**Recent Activity Summary**:
```
fields @timestamp, @message
| stats count() by bin(1h)
| sort @timestamp desc
```

---

## Quick Links Generator

Run this script to generate all console links for your account:

```bash
#!/bin/bash
REGION="us-west-1"
ACCOUNT_ID="YOUR_ACCOUNT_ID"
FUNCTION_NAME="mnemora-birthday-bot-prod"
SUMMARY_FUNCTION="mnemora-daily-summary-prod"
STACK_NAME="mnemora-birthday-bot-prod"
BUCKET_NAME="mnemora-whatsapp-sessions-prod-${ACCOUNT_ID}"
SNS_TOPIC="mnemora-alerts-prod"
NAMESPACE="Mnemora/BirthdayBot/prod"

echo "=== Lambda Functions ==="
echo "Main Function:"
echo "  https://${REGION}.console.aws.amazon.com/lambda/home?region=${REGION}#/functions/${FUNCTION_NAME}"
echo "  Monitoring: https://${REGION}.console.aws.amazon.com/lambda/home?region=${REGION}#/functions/${FUNCTION_NAME}/monitoring"
echo "  Logs: https://${REGION}.console.aws.amazon.com/lambda/home?region=${REGION}#/functions/${FUNCTION_NAME}/monitoring/logs"
echo ""
echo "Daily Summary:"
echo "  https://${REGION}.console.aws.amazon.com/lambda/home?region=${REGION}#/functions/${SUMMARY_FUNCTION}"
echo ""

echo "=== CloudWatch Logs ==="
echo "Main Log Group:"
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252F${FUNCTION_NAME}"
echo "Log Insights:"
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:logs-insights"
echo ""

echo "=== CloudWatch Metrics ==="
echo "Custom Metrics:"
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#metricsV2:graph=~();namespace=${NAMESPACE}"
echo "Lambda Metrics:"
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#metricsV2:graph=~();namespace=AWS/Lambda;dimensions=FunctionName~${FUNCTION_NAME}"
echo ""

echo "=== CloudWatch Alarms ==="
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#alarmsV2:?alarmNameFilter=mnemora"
echo ""

echo "=== X-Ray ==="
echo "  https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#xray:traces"
echo ""

echo "=== S3 Bucket ==="
echo "  https://s3.console.aws.amazon.com/s3/buckets/${BUCKET_NAME}?region=${REGION}&tab=objects"
echo ""

echo "=== SNS Topic ==="
echo "  https://${REGION}.console.aws.amazon.com/sns/v3/home?region=${REGION}#/topic/arn:aws:sns:${REGION}:${ACCOUNT_ID}:${SNS_TOPIC}"
echo ""

echo "=== EventBridge Rules ==="
echo "Daily Execution:"
echo "  https://${REGION}.console.aws.amazon.com/events/home?region=${REGION}#/rules/mnemora-daily-execution-prod"
echo "Daily Summary:"
echo "  https://${REGION}.console.aws.amazon.com/events/home?region=${REGION}#/rules/mnemora-daily-summary-prod"
echo ""

echo "=== CloudFormation ==="
echo "  https://${REGION}.console.aws.amazon.com/cloudformation/home?region=${REGION}#/stacks/stackinfo?stackId=arn:aws:cloudformation:${REGION}:${ACCOUNT_ID}:stack%2F${STACK_NAME}"
echo ""

echo "=== Cost Management ==="
echo "Cost Explorer:"
echo "  https://console.aws.amazon.com/cost-management/home#/cost-explorer"
echo "Billing Dashboard:"
echo "  https://console.aws.amazon.com/billing/home#/"
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

