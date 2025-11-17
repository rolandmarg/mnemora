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

echo "Installing production dependencies..."
cd dist
yarn install --production --frozen-lockfile --ignore-scripts
cd ..

echo "✅ Build complete"

