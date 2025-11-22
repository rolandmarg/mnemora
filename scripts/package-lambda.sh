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
echo "Building with SAM (production mode)..."
export NODEJS_PACKAGE_MANAGER=yarn
export NODE_ENV=production
# Ensure production mode for SAM build
# SAM will use existing node_modules from dist/ if present, which already has production deps only
sam build \
  --template-file "$PROJECT_ROOT/infrastructure/template.yaml"
echo "✅ SAM build complete"

echo ""
echo "Cleaning up unused dependencies..."
echo "Note: We only remove entire unused packages, never modify library internals"
for FUNCTION_DIR in .aws-sam/build/*Function; do
  if [ -d "$FUNCTION_DIR/node_modules" ]; then
    echo "   Cleaning $(basename "$FUNCTION_DIR")..."
    
    # Remove devDependencies (should not be in production Lambda)
    # These should be excluded by --production, but SAM might re-install, so remove them explicitly
    echo "      Removing devDependencies..."
    rm -rf "$FUNCTION_DIR/node_modules/typescript" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@typescript-eslint" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/eslint" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@eslint" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@eslint-community" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@types" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/vitest" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@vitest" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/tsx" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/pino-pretty" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/globals" 2>/dev/null || true
    # Remove any eslint-related packages (catch-all)
    find "$FUNCTION_DIR/node_modules" -maxdepth 1 -type d -name "eslint*" -exec rm -rf {} + 2>/dev/null || true
    # Remove TypeScript-related packages (catch-all)
    find "$FUNCTION_DIR/node_modules" -maxdepth 1 -type d -name "*typescript*" -exec rm -rf {} + 2>/dev/null || true
    
    # Clean up .bin directories (CLI tools not needed in Lambda)
    # First remove broken symlinks, then remove entire .bin directories to save space
    echo "      Cleaning up .bin directories (CLI tools not needed in Lambda)..."
    find "$FUNCTION_DIR/node_modules" -type d -name ".bin" -exec sh -c 'for link in "$1"/*; do [ -L "$link" ] && [ ! -e "$link" ] && rm -f "$link"; done' _ {} \; 2>/dev/null || true
    find "$FUNCTION_DIR/node_modules" -type d -name ".bin" -exec rm -rf {} + 2>/dev/null || true
    
    # Remove audio decoders (only needed for Baileys 6.17.16+, we're using 6.7.21)
    echo "      Removing audio decoders (not needed with Baileys 6.7.21)..."
    rm -rf "$FUNCTION_DIR/node_modules/@wasm-audio-decoders" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/node-wav" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/ogg-opus-decoder" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/audio-decode" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/audio-buffer" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/audio-type" 2>/dev/null || true
    
    # Remove unused AWS SDK credential providers (Lambda only needs env and node providers)
    echo "      Removing unused AWS SDK credential providers..."
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/credential-provider-ini" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/credential-provider-sso" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/credential-provider-login" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/credential-provider-process" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/credential-provider-web-identity" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/credential-provider-http" 2>/dev/null || true
    rm -rf "$FUNCTION_DIR/node_modules/@aws-sdk/client-sso" 2>/dev/null || true
    # Keep: credential-provider-env, credential-provider-node (needed for Lambda IAM roles)
    
    # Remove sharp (optional peer dependency, not needed for Lambda)
    rm -rf "$FUNCTION_DIR/node_modules/@img" "$FUNCTION_DIR/node_modules/sharp" 2>/dev/null || true
    
    # Clean up googleapis by removing unused API modules (entire modules, not library internals)
    # googleapis is modular - each API (calendar, sheets, drive, etc.) is a separate module
    # We only keep the modules we actually use (calendar and sheets)
    if [ -d "$FUNCTION_DIR/node_modules/googleapis" ]; then
      echo "      Cleaning googleapis (removing unused API modules)..."
      # Remove unused Google API modules (keep only calendar and sheets)
      # Note: googleapis-common is a separate package and is already included
      # This removes entire API modules, not parts of the library
      if [ -d "$FUNCTION_DIR/node_modules/googleapis/build/src/apis" ]; then
        find "$FUNCTION_DIR/node_modules/googleapis/build/src/apis" -mindepth 1 -maxdepth 1 -type d ! -name "calendar" ! -name "sheets" -exec rm -rf {} + 2>/dev/null || true
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
    
    # Remove TypeScript definition files (not needed at runtime, saves ~29MB)
    echo "      Removing TypeScript definition files..."
    find "$FUNCTION_DIR/node_modules" -name "*.d.ts" -delete 2>/dev/null || true
    
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

