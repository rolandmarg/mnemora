#!/bin/bash
# Build script for Lambda deployment

set -e

# Ensure production environment
export NODE_ENV=production

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Building TypeScript..."
yarn build

echo "Copying files to dist..."
cp package.json dist/
cp yarn.lock dist/

# Remove old node_modules to ensure clean install
if [ -d "dist/node_modules" ]; then
    echo "Removing old node_modules for clean install..."
    rm -rf dist/node_modules
fi

# Install production dependencies in dist
# SAM will copy this directory with node_modules, so only production deps will be included
echo "Installing production dependencies in dist..."
cd dist
# Use production flags: --production excludes devDependencies, --frozen-lockfile ensures consistency
# NODE_ENV=production is already exported, but explicit here for clarity
NODE_ENV=production yarn install --production --frozen-lockfile --ignore-scripts
cd ..

# Clean up dist/node_modules to reduce package size
# Note: We only remove entire unused packages, never modify library internals
if [ -d "dist/node_modules" ]; then
    echo ""
    echo "Cleaning up dist/node_modules to reduce package size..."
    
    # Remove devDependencies (should not be in production, but may slip through)
    echo "   Removing devDependencies..."
    rm -rf dist/node_modules/typescript 2>/dev/null || true
    rm -rf dist/node_modules/@typescript-eslint 2>/dev/null || true
    rm -rf dist/node_modules/eslint 2>/dev/null || true
    rm -rf dist/node_modules/@eslint 2>/dev/null || true
    rm -rf dist/node_modules/@eslint-community 2>/dev/null || true
    rm -rf dist/node_modules/@types 2>/dev/null || true
    rm -rf dist/node_modules/vitest 2>/dev/null || true
    rm -rf dist/node_modules/@vitest 2>/dev/null || true
    rm -rf dist/node_modules/tsx 2>/dev/null || true
    rm -rf dist/node_modules/pino-pretty 2>/dev/null || true
    rm -rf dist/node_modules/globals 2>/dev/null || true
    find dist/node_modules -maxdepth 1 -type d -name "eslint*" -exec rm -rf {} + 2>/dev/null || true
    find dist/node_modules -maxdepth 1 -type d -name "*typescript*" -exec rm -rf {} + 2>/dev/null || true
    
    # Clean up .bin directories (CLI tools not needed in Lambda)
    # First remove broken symlinks, then remove entire .bin directories to save space
    echo "   Cleaning up .bin directories (CLI tools not needed in Lambda)..."
    find dist/node_modules -type d -name ".bin" -exec sh -c 'for link in "$1"/*; do [ -L "$link" ] && [ ! -e "$link" ] && rm -f "$link"; done' _ {} \; 2>/dev/null || true
    find dist/node_modules -type d -name ".bin" -exec rm -rf {} + 2>/dev/null || true
    
    # Remove audio decoders (only needed for Baileys 6.17.16+, we're using 6.7.21)
    echo "   Removing audio decoders (not needed with Baileys 6.7.21)..."
    rm -rf dist/node_modules/@wasm-audio-decoders 2>/dev/null || true
    rm -rf dist/node_modules/node-wav 2>/dev/null || true
    rm -rf dist/node_modules/ogg-opus-decoder 2>/dev/null || true
    rm -rf dist/node_modules/audio-decode 2>/dev/null || true
    rm -rf dist/node_modules/audio-buffer 2>/dev/null || true
    rm -rf dist/node_modules/audio-type 2>/dev/null || true
    
    # Remove unused AWS SDK credential providers
    echo "   Removing unused AWS SDK credential providers..."
    rm -rf dist/node_modules/@aws-sdk/credential-provider-ini 2>/dev/null || true
    rm -rf dist/node_modules/@aws-sdk/credential-provider-sso 2>/dev/null || true
    rm -rf dist/node_modules/@aws-sdk/credential-provider-login 2>/dev/null || true
    rm -rf dist/node_modules/@aws-sdk/credential-provider-process 2>/dev/null || true
    rm -rf dist/node_modules/@aws-sdk/credential-provider-web-identity 2>/dev/null || true
    rm -rf dist/node_modules/@aws-sdk/credential-provider-http 2>/dev/null || true
    rm -rf dist/node_modules/@aws-sdk/client-sso 2>/dev/null || true
    
    # Clean up googleapis by removing unused API modules (saves ~191MB!)
    # googleapis is modular - each API (calendar, sheets, drive, etc.) is a separate module
    # We only keep the modules we actually use (calendar and sheets)
    if [ -d "dist/node_modules/googleapis" ]; then
        echo "   Cleaning googleapis (removing unused API modules, saves ~191MB)..."
        # Remove unused Google API modules (keep only calendar and sheets)
        # Note: googleapis-common is a separate package and is already included
        # This removes entire API modules, not parts of the library
        if [ -d "dist/node_modules/googleapis/build/src/apis" ]; then
            find dist/node_modules/googleapis/build/src/apis -mindepth 1 -maxdepth 1 -type d ! -name "calendar" ! -name "sheets" -exec rm -rf {} + 2>/dev/null || true
        fi
        # Remove TypeScript source files (we only need compiled JS)
        find dist/node_modules/googleapis -name "*.ts" -delete 2>/dev/null || true
        find dist/node_modules/googleapis -name "*.d.ts" -delete 2>/dev/null || true
        # Remove source maps
        find dist/node_modules/googleapis -name "*.map" -delete 2>/dev/null || true
        # Remove test files and documentation
        find dist/node_modules/googleapis -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true
        find dist/node_modules/googleapis -name "*.md" -delete 2>/dev/null || true
        find dist/node_modules/googleapis -name "CHANGELOG*" -delete 2>/dev/null || true
        find dist/node_modules/googleapis -name "LICENSE*" -delete 2>/dev/null || true
    fi
    
    # Remove TypeScript definition files (not needed at runtime, saves ~29MB)
    echo "   Removing TypeScript definition files..."
    find dist/node_modules -name "*.d.ts" -delete 2>/dev/null || true
    
    # Remove source maps and other unnecessary files
    echo "   Removing source maps and documentation..."
    find dist/node_modules -name "*.map" -delete 2>/dev/null || true
    find dist/node_modules -name "*.md" -delete 2>/dev/null || true
    find dist/node_modules -name "CHANGELOG*" -delete 2>/dev/null || true
    find dist/node_modules -name "LICENSE*" -delete 2>/dev/null || true
    find dist/node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true
    
    echo "   ✅ Cleanup complete"
fi

# Clean up unnecessary files from dist/ application code
# These files are not needed at runtime in Lambda
echo ""
echo "Cleaning up unnecessary files from dist/ application code..."
echo "   Removing TypeScript definition files (.d.ts)..."
find dist -name "*.d.ts" -not -path "dist/node_modules/*" -delete 2>/dev/null || true

echo "   Removing source maps (.map)..."
find dist -name "*.map" -not -path "dist/node_modules/*" -delete 2>/dev/null || true

echo "   Removing tests directory..."
rm -rf dist/tests 2>/dev/null || true

echo "   Removing scripts directory (not needed in Lambda)..."
rm -rf dist/scripts 2>/dev/null || true

echo "   ✅ Application code cleanup complete"

echo ""
echo "📦 Package size (with node_modules):"
SIZE=$(du -sh dist 2>/dev/null | cut -f1)
SIZE_MB=$(du -sm dist 2>/dev/null | cut -f1)
echo "   dist/: $SIZE (${SIZE_MB}MB)"
echo "   (dependencies installed and cleaned, SAM will use them during build)"

echo ""
echo "✅ Build complete"

