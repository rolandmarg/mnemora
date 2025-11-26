#!/usr/bin/env node
/**
 * Build script for Lambda deployment
 * Builds TypeScript, installs production dependencies, and cleans up unnecessary files
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Get project root - scripts are run from project root, so use process.cwd()
const PROJECT_ROOT = process.cwd();

process.env.NODE_ENV = 'production';

function exec(command: string, options?: { cwd?: string; stdio?: 'inherit' | 'pipe' }) {
  console.log(`Running: ${command}`);
  execSync(command, { 
    cwd: options?.cwd ?? PROJECT_ROOT,
    stdio: options?.stdio ?? 'inherit',
    encoding: 'utf-8'
  });
}

function removeIfExists(path: string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function removeFiles(pattern: string, baseDir: string) {
  try {
    execSync(`find "${baseDir}" -name "${pattern}" -delete`, { 
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
}

function removeDirs(pattern: string, baseDir: string) {
  try {
    execSync(`find "${baseDir}" -type d -name "${pattern}" -exec rm -rf {} +`, { 
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
}

function getSize(dir: string): { human: string; mb: number } {
  try {
    const output = execSync(`du -sh "${dir}"`, { encoding: 'utf-8' }).trim();
    const mbOutput = execSync(`du -sm "${dir}"`, { encoding: 'utf-8' }).trim();
    return {
      human: output.split('\t')[0],
      mb: parseInt(mbOutput.split('\t')[0], 10)
    };
  } catch {
    return { human: 'unknown', mb: 0 };
  }
}

console.log('Building TypeScript...');
exec('yarn build');

console.log('Copying files to dist...');
cpSync(join(PROJECT_ROOT, 'package.json'), join(PROJECT_ROOT, 'dist/package.json'));
cpSync(join(PROJECT_ROOT, 'yarn.lock'), join(PROJECT_ROOT, 'dist/yarn.lock'));

// Remove old node_modules to ensure clean install
const distNodeModules = join(PROJECT_ROOT, 'dist/node_modules');
if (existsSync(distNodeModules)) {
  console.log('Removing old node_modules for clean install...');
  rmSync(distNodeModules, { recursive: true, force: true });
}

// Install dependencies in dist (will remove devDependencies manually after)
console.log('Installing dependencies in dist...');
exec('NODE_ENV=production YARN_ENABLE_SCRIPTS=false yarn install --immutable', {
  cwd: join(PROJECT_ROOT, 'dist')
});

// Remove devDependencies manually (yarn workspaces focus doesn't work reliably for single packages)
console.log('Removing devDependencies...');
const distPackageJsonPath = join(PROJECT_ROOT, 'dist/package.json');
const packageJson = JSON.parse(readFileSync(distPackageJsonPath, 'utf-8'));
const devDepsToRemove = Object.keys(packageJson.devDependencies ?? {});
for (const dep of devDepsToRemove) {
  removeIfExists(join(distNodeModules, dep));
  // Also remove scoped packages
  if (dep.includes('/')) {
    const [scope, name] = dep.split('/');
    removeIfExists(join(distNodeModules, scope, name));
  }
}
// Remove wildcard patterns for common dev dependency scopes and transitive dependencies
removeDirs('@typescript-eslint*', distNodeModules);
removeDirs('@eslint*', distNodeModules);
removeDirs('@esbuild*', distNodeModules);
removeDirs('*typescript*', distNodeModules);
removeDirs('*vitest*', distNodeModules);
removeDirs('*eslint*', distNodeModules);
// Remove transitive dev dependencies (from vitest, etc.)
removeDirs('*rollup*', distNodeModules);
removeDirs('*vite*', distNodeModules);
removeDirs('*node-gyp*', distNodeModules);
// Explicitly remove known dev dependencies that might be transitive
const knownTransitiveDevDeps = ['rollup', 'vite', 'node-gyp', '@rollup'];
for (const dep of knownTransitiveDevDeps) {
  removeIfExists(join(distNodeModules, dep));
}

// Clean up dist/node_modules to reduce package size
if (existsSync(distNodeModules)) {
  console.log('');
  console.log('Cleaning up dist/node_modules to reduce package size...');
  
  // Note: devDependencies are already removed by yarn workspaces focus --production
  
  // Clean up .bin directories
  console.log('   Cleaning up .bin directories (CLI tools not needed in Lambda)...');
  try {
    execSync(`find "${distNodeModules}" -type d -name ".bin" -exec sh -c 'for link in "$1"/*; do [ -L "$link" ] && [ ! -e "$link" ] && rm -f "$link"; done' _ {} \\;`, {
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
  removeDirs('.bin', distNodeModules);
  
  // Remove audio decoders
  console.log('   Removing audio decoders (not needed with Baileys 6.7.21)...');
  const audioDecoders = [
    '@wasm-audio-decoders',
    'node-wav',
    'ogg-opus-decoder',
    'audio-decode',
    'audio-buffer',
    'audio-type'
  ];
  
  for (const decoder of audioDecoders) {
    removeIfExists(join(distNodeModules, decoder));
  }
  
  // Remove unused AWS SDK credential providers
  console.log('   Removing unused AWS SDK credential providers...');
  const unusedProviders = [
    '@aws-sdk/credential-provider-ini',
    '@aws-sdk/credential-provider-sso',
    '@aws-sdk/credential-provider-login',
    '@aws-sdk/credential-provider-process',
    '@aws-sdk/credential-provider-web-identity',
    '@aws-sdk/credential-provider-http',
    '@aws-sdk/client-sso'
  ];
  
  for (const provider of unusedProviders) {
    removeIfExists(join(distNodeModules, provider));
  }
  
  // Remove TypeScript definition files
  console.log('   Removing TypeScript definition files...');
  removeFiles('*.d.ts', distNodeModules);
  
  // Remove source maps and other unnecessary files
  console.log('   Removing source maps and documentation...');
  removeFiles('*.map', distNodeModules);
  removeFiles('*.md', distNodeModules);
  removeFiles('CHANGELOG*', distNodeModules);
  removeFiles('LICENSE*', distNodeModules);
  removeDirs('test', distNodeModules);
  removeDirs('tests', distNodeModules);
  removeDirs('__tests__', distNodeModules);
  removeDirs('docs', distNodeModules);
  removeDirs('examples', distNodeModules);
  
  console.log('   ✅ Cleanup complete');
}

// Clean up unnecessary files from dist/ application code
console.log('');
console.log('Cleaning up unnecessary files from dist/ application code...');
console.log('   Removing TypeScript definition files (.d.ts)...');
removeFiles('*.d.ts', join(PROJECT_ROOT, 'dist'));
console.log('   Removing source maps (.map)...');
removeFiles('*.map', join(PROJECT_ROOT, 'dist'));
console.log('   Removing tests directory...');
removeIfExists(join(PROJECT_ROOT, 'dist/tests'));
console.log('   Removing scripts directory (not needed in Lambda)...');
removeIfExists(join(PROJECT_ROOT, 'dist/scripts'));
console.log('   ✅ Application code cleanup complete');

console.log('');
const size = getSize(join(PROJECT_ROOT, 'dist'));
console.log('📦 Package size (with node_modules):');
console.log(`   dist/: ${size.human} (${size.mb}MB)`);
console.log('   (dependencies installed and cleaned, SAM will use them during build)');

console.log('');
console.log('✅ Build complete');

