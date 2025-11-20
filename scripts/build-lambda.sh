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

# Remove node_modules if it exists (SAM will install dependencies during build)
if [ -d "dist/node_modules" ]; then
  echo "Removing existing node_modules (SAM will install dependencies)..."
  rm -rf dist/node_modules
fi

echo ""
echo "📦 Package size (without node_modules - SAM will install dependencies):"
SIZE=$(du -sh dist 2>/dev/null | cut -f1)
SIZE_MB=$(du -sm dist 2>/dev/null | cut -f1)
echo "   dist/: $SIZE (${SIZE_MB}MB)"
echo "   (node_modules will be installed by SAM during build)"

echo ""
echo "✅ Build complete"

