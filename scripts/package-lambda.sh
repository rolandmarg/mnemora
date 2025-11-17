#!/bin/bash
# Package Lambda functions (build + SAM build + cleanup)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Building application..."
yarn build:lambda
echo "✅ Build complete"

echo ""
echo "Building with SAM..."
export NODEJS_PACKAGE_MANAGER=yarn
sam build --template-file "$PROJECT_ROOT/infrastructure/template.yaml"
echo "✅ SAM build complete"

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

