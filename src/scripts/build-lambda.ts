#!/usr/bin/env node
/**
 * Build script for Lambda deployment
 * Builds TypeScript, installs production dependencies, and cleans up unnecessary files
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, removeIfExists, removeFiles, removeDirs, getSize, cleanNodeModules } from './lambda-cleanup.js';

// Get project root - scripts are run from project root, so use process.cwd()
const PROJECT_ROOT = process.cwd();

process.env.NODE_ENV = 'production';

console.log('Building TypeScript...');
exec('yarn build');

console.log('Copying files to dist...');
cpSync(join(PROJECT_ROOT, 'package.json'), join(PROJECT_ROOT, 'dist/package.json'));
cpSync(join(PROJECT_ROOT, 'yarn.lock'), join(PROJECT_ROOT, 'dist/yarn.lock'));
// Copy Yarn 4 configuration and binary (required for SAM's yarn install)
if (existsSync(join(PROJECT_ROOT, '.yarnrc.yml'))) {
  cpSync(join(PROJECT_ROOT, '.yarnrc.yml'), join(PROJECT_ROOT, 'dist/.yarnrc.yml'));
}
// Copy only .yarn/releases/ (Yarn binary), not build artifacts like install-state.gz
const yarnReleasesSrc = join(PROJECT_ROOT, '.yarn/releases');
const yarnReleasesDest = join(PROJECT_ROOT, 'dist/.yarn/releases');
if (existsSync(yarnReleasesSrc)) {
  execSync(`mkdir -p "${join(PROJECT_ROOT, 'dist/.yarn')}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  cpSync(yarnReleasesSrc, yarnReleasesDest, { recursive: true });
}

// Create empty .git directory as workaround for SAM's NodejsNpmBuilder bug
// npm pack outputs ".git can't be found" message when .git is missing
// SAM's NodejsNpmBuilder misinterprets this message as a file path and fails
// Creating empty .git prevents npm pack from outputting the message
// This is a SAM bug, not an npm bug - upgrading npm won't fix it
console.log('Creating empty .git directory as workaround for SAM NodejsNpmBuilder...');
const distGitDir = join(PROJECT_ROOT, 'dist/.git');
if (!existsSync(distGitDir)) {
  execSync(`mkdir -p "${distGitDir}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  // Create a minimal .git/config file so npm pack recognizes it as a git repo
  writeFileSync(join(distGitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
  console.log('✅ Empty .git directory created');
}

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
removeDirs('*eslint*', distNodeModules);
// Remove transitive dev dependencies
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
  cleanNodeModules(distNodeModules, {
    apisIndexFallbackDirs: [join(PROJECT_ROOT, 'node_modules')],
  });
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
