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
    
    # Aggressively clean up googleapis (193MB -> target <50MB)
    if [ -d "$FUNCTION_DIR/node_modules/googleapis" ]; then
      echo "      Aggressively cleaning googleapis (largest dependency)..."
      # Remove unused Google APIs (keep only calendar, sheets, and common)
      if [ -d "$FUNCTION_DIR/node_modules/googleapis/build/src/apis" ]; then
        find "$FUNCTION_DIR/node_modules/googleapis/build/src/apis" -mindepth 1 -maxdepth 1 -type d ! -name "calendar" ! -name "sheets" ! -name "common" -exec rm -rf {} + 2>/dev/null || true
      fi
      # Remove TypeScript source files (we only need compiled JS)
      find "$FUNCTION_DIR/node_modules/googleapis" -name "*.ts" -delete 2>/dev/null || true
      find "$FUNCTION_DIR/node_modules/googleapis" -name "*.d.ts" -delete 2>/dev/null || true
      # Remove source maps
      find "$FUNCTION_DIR/node_modules/googleapis" -name "*.map" -delete 2>/dev/null || true
      # Remove test files and documentation
      find "$FUNCTION_DIR/node_modules/googleapis" -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true
      find "$FUNCTION_DIR/node_modules/googleapis" -name "*.md" -delete 2>/dev/null || true
      find "$FUNCTION_DIR/node_modules/googleapis" -name "CHANGELOG*" -delete 2>/dev/null || true
      find "$FUNCTION_DIR/node_modules/googleapis" -name "LICENSE*" -delete 2>/dev/null || true
      # Remove node_modules within googleapis (nested dependencies we might not need)
      if [ -d "$FUNCTION_DIR/node_modules/googleapis/node_modules" ]; then
        # Keep only essential nested deps, remove others
        find "$FUNCTION_DIR/node_modules/googleapis/node_modules" -mindepth 1 -maxdepth 1 -type d ! -name "gaxios" ! -name "google-auth-library" ! -name "gtoken" -exec rm -rf {} + 2>/dev/null || true
      fi
    fi
    
    # Remove source maps and other unnecessary files from all node_modules
    find "$FUNCTION_DIR/node_modules" -name "*.map" -delete 2>/dev/null || true
    find "$FUNCTION_DIR/node_modules" -name "*.md" -delete 2>/dev/null || true
    find "$FUNCTION_DIR/node_modules" -name "CHANGELOG*" -delete 2>/dev/null || true
    find "$FUNCTION_DIR/node_modules" -name "LICENSE*" -delete 2>/dev/null || true
    find "$FUNCTION_DIR/node_modules" -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true
    
    # Check size after cleanup
    SIZE_MB=$(du -sm "$FUNCTION_DIR" 2>/dev/null | cut -f1)
    SIZE_HUMAN=$(du -sh "$FUNCTION_DIR" 2>/dev/null | cut -f1)
    echo "      Size: $SIZE_HUMAN (${SIZE_MB}MB)"
    
    if [ "$SIZE_MB" -gt 250 ]; then
      echo "      ❌ ERROR: Package size (${SIZE_MB}MB) exceeds 250MB limit!"
      echo "      This will cause deployment to fail. Please reduce dependencies or use Lambda Layers."
      exit 1
    elif [ "$SIZE_MB" -gt 200 ]; then
      echo "      ⚠️  WARNING: Package size (${SIZE_MB}MB) is close to 250MB limit"
    else
      echo "      ✅ Package size is within limits"
    fi
    
    # Show breakdown of largest directories (sorted by size, largest first)
    echo "      Top dependencies:"
    du -sm "$FUNCTION_DIR/node_modules"/* 2>/dev/null | sort -rn | head -5 | while read -r size_mb path; do
      size_human=$(du -sh "$path" 2>/dev/null | cut -f1)
      name=$(basename "$path")
      printf "        %6s  %s\n" "$size_human" "$name"
    done
  fi
done
echo ""
echo "✅ Cleanup complete"

