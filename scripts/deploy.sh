#!/bin/bash
# Automated deployment script

set -e

echo "=========================================="
echo "Mnemora AWS Deployment"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not installed"
    exit 1
fi
echo "✅ AWS CLI installed"

# Check SAM CLI
if ! command -v sam &> /dev/null; then
    echo "❌ SAM CLI not installed. Install with: brew install aws-sam-cli"
    exit 1
fi
echo "✅ SAM CLI installed"

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo "❌ AWS credentials not configured. Run: aws configure"
    exit 1
fi
echo "✅ AWS credentials configured"

# Check permissions (warning only - SAM will fail with clear error if permissions are missing)
echo ""
echo "Checking AWS permissions..."
if aws cloudformation list-stacks --max-items 1 &>/dev/null; then
    echo "✅ CloudFormation permissions: OK"
else
    echo "⚠️  Could not verify CloudFormation permissions (this is OK - SAM will check during deployment)"
fi

# Build application
echo ""
echo "Building application..."
yarn build
echo "✅ Build complete"

# Build with SAM
echo ""
echo "Building with SAM..."
sam build --template-file infrastructure/template.yaml
echo "✅ SAM build complete"

# Deploy
echo ""
echo "Deploying to AWS..."
echo "This may take 5-10 minutes..."
echo ""

sam deploy --template-file infrastructure/template.yaml --config-file infrastructure/samconfig.toml --resolve-s3

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Check your email (mnemoraapp@gmail.com) for SNS subscription confirmation"
echo "2. Click the confirmation link in the email"
echo "3. Check CloudWatch Logs for WhatsApp QR code (first run)"
echo "4. Scan QR code with WhatsApp mobile app"
echo ""
echo "View logs:"
echo "  aws logs tail /aws/lambda/mnemora-birthday-bot-prod --follow"
echo ""

