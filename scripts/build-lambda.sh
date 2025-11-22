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

# Install production dependencies in dist
# SAM will copy this directory with node_modules, so only production deps will be included
echo "Installing production dependencies in dist..."
cd dist
# Use production flags: --production excludes devDependencies, --frozen-lockfile ensures consistency
# NODE_ENV=production is already exported, but explicit here for clarity
NODE_ENV=production yarn install --production --frozen-lockfile --ignore-scripts
cd ..

echo ""
echo "📦 Package size (with node_modules):"
SIZE=$(du -sh dist 2>/dev/null | cut -f1)
SIZE_MB=$(du -sm dist 2>/dev/null | cut -f1)
echo "   dist/: $SIZE (${SIZE_MB}MB)"
echo "   (dependencies installed, SAM will use them during build)"

echo ""
echo "✅ Build complete"

