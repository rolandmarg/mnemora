#!/bin/bash
# Automated deployment script

set -e

# Ensure production environment
export NODE_ENV=production

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

# Check SAM CLI version (minimum 1.148.0 required for nodejs24.x support)
SAM_VERSION=$(sam --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
MIN_SAM_VERSION="1.148.0"

# Compare versions using sort -V (version sort)
if [ "$(printf '%s\n' "$MIN_SAM_VERSION" "$SAM_VERSION" | sort -V | head -n1)" != "$MIN_SAM_VERSION" ]; then
    echo "❌ SAM CLI version $SAM_VERSION is too old. Minimum required: $MIN_SAM_VERSION"
    echo "   Update with: brew upgrade aws-sam-cli"
    exit 1
fi
echo "✅ SAM CLI installed (version $SAM_VERSION, minimum required: $MIN_SAM_VERSION)"

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

# Package Lambda functions (build + SAM build + cleanup)
# Note: package-lambda.sh sets NODE_ENV=production and uses --production flags
echo ""
echo "Building and packaging Lambda functions (production mode)..."
./scripts/package-lambda.sh

# Deploy
echo ""
echo "Deploying to AWS..."
echo "This may take 5-10 minutes..."
echo ""

sam deploy \
  --template-file "$PROJECT_ROOT/infrastructure/template.yaml" \
  --config-file "$PROJECT_ROOT/infrastructure/samconfig.toml" \
  "$@"

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

