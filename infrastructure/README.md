# Infrastructure Configuration

This directory contains all AWS infrastructure-as-code configuration files.

## Files

- **`template.yaml`** - AWS SAM (Serverless Application Model) template
  - Defines Lambda functions, IAM roles, S3 buckets, SNS topics, EventBridge rules
  - Main infrastructure definition

- **`samconfig.toml`** - SAM CLI configuration
  - Deployment parameters (stack name, region, environment variables)
  - Used by `sam deploy` command

- **`cloudwatch-alarms.yaml`** - CloudWatch Alarms configuration
  - Monitoring and alerting rules
  - Can be deployed separately or included in main template

## Usage

### Build and Deploy

```bash
# Build
sam build --template-file infrastructure/template.yaml --config-file infrastructure/samconfig.toml

# Deploy
sam deploy --template-file infrastructure/template.yaml --config-file infrastructure/samconfig.toml
```

### Quick Deploy (uses config file)

```bash
sam build -t infrastructure/template.yaml
sam deploy -t infrastructure/template.yaml
```

### Using the deploy script

```bash
./scripts/deploy.sh
```

This script automatically uses the correct paths.

## File Locations

All infrastructure files are centralized here for:
- ✅ Easy organization
- ✅ Clear separation of concerns
- ✅ Version control
- ✅ Team collaboration

## Notes

- The `samconfig.toml` file contains sensitive values (base64-encoded private keys)
- Never commit unencrypted secrets to version control
- For production, consider using AWS Secrets Manager or Parameter Store

