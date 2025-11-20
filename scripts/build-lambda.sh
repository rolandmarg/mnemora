#!/bin/bash
# Build script for Lambda deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Building TypeScript..."
yarn build

echo "Copying files to dist..."
cp package.json dist/
cp yarn.lock dist/

# Install dependencies in dist to ensure all packages (including dotenv) are available
# SAM will use these during build
echo "Installing dependencies in dist..."
cd dist
yarn install --production --frozen-lockfile
cd ..

echo ""
echo "📦 Package size (with node_modules):"
SIZE=$(du -sh dist 2>/dev/null | cut -f1)
SIZE_MB=$(du -sm dist 2>/dev/null | cut -f1)
echo "   dist/: $SIZE (${SIZE_MB}MB)"
echo "   (dependencies installed, SAM will use them during build)"

echo ""
echo "✅ Build complete"

