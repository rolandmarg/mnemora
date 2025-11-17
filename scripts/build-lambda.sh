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

echo ""
echo "📦 Package size:"
if [ -d "dist/node_modules" ]; then
  SIZE=$(du -sh dist/node_modules 2>/dev/null | cut -f1)
  SIZE_MB=$(du -sm dist/node_modules 2>/dev/null | cut -f1)
  echo "   node_modules: $SIZE (${SIZE_MB}MB)"
  
  # Show largest dependencies (sorted by size)
  echo "   Largest dependencies:"
  du -sm dist/node_modules/* 2>/dev/null | sort -rn | head -5 | while read -r size_mb path; do
    size_human=$(du -sh "$path" 2>/dev/null | cut -f1)
    name=$(basename "$path")
    printf "     %6s  %s\n" "$size_human" "$name"
  done
else
  echo "   ⚠️  node_modules not found"
fi

echo ""
echo "✅ Build complete"

