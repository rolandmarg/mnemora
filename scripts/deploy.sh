#!/bin/bash
# Automated deployment script

set -e

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

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
yarn build:lambda
echo "✅ Build complete"

# Build with SAM
echo ""
echo "Building with SAM..."
# SAM will detect changes in dist/ and package.json and rebuild accordingly
# It will also install dependencies from package.json automatically
sam build --template-file "$PROJECT_ROOT/infrastructure/template.yaml"
echo "✅ SAM build complete"

# Deploy
echo ""
echo "Deploying to AWS..."
echo "This may take 5-10 minutes..."
echo ""

sam deploy --template-file "$PROJECT_ROOT/infrastructure/template.yaml" --config-file "$PROJECT_ROOT/infrastructure/samconfig.toml"

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

