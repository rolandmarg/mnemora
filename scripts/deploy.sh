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
# Tell SAM to use yarn instead of npm (since we're using yarn.lock)
export NODEJS_PACKAGE_MANAGER=yarn
# SAM will detect changes in dist/ and package.json and rebuild accordingly
# It will also install dependencies from package.json using yarn automatically
sam build --template-file "$PROJECT_ROOT/infrastructure/template.yaml"
echo "✅ SAM build complete"

# Clean up unused dependencies to reduce Lambda package size
# This must happen AFTER SAM build since SAM reinstalls dependencies
echo ""
echo "Cleaning up unused dependencies..."
for FUNCTION_DIR in .aws-sam/build/*Function; do
  if [ -d "$FUNCTION_DIR/node_modules" ]; then
    echo "   Cleaning $(basename "$FUNCTION_DIR")..."
    
    # Remove sharp (optional peer dependency, not needed for Lambda)
    rm -rf "$FUNCTION_DIR/node_modules/@img" "$FUNCTION_DIR/node_modules/sharp" 2>/dev/null || true
    
    # Remove unused date-fns locales (keep only en-US)
    if [ -d "$FUNCTION_DIR/node_modules/date-fns/locale" ]; then
      find "$FUNCTION_DIR/node_modules/date-fns/locale" -mindepth 1 -maxdepth 1 -type d ! -name "en-US" -exec rm -rf {} + 2>/dev/null || true
    fi
    
    # Remove unused googleapis APIs (keep only calendar, sheets, and common)
    if [ -d "$FUNCTION_DIR/node_modules/googleapis/build/src/apis" ]; then
      find "$FUNCTION_DIR/node_modules/googleapis/build/src/apis" -mindepth 1 -maxdepth 1 -type d ! -name "calendar" ! -name "sheets" ! -name "common" -exec rm -rf {} + 2>/dev/null || true
    fi
  fi
done
echo "✅ Cleanup complete"

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

