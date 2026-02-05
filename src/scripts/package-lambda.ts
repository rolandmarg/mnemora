#!/usr/bin/env node
/**
 * Package Lambda functions (build + SAM build + cleanup)
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exec, removeIfExists, removeDirs, getSize, cleanNodeModules } from './lambda-cleanup.js';

const PROJECT_ROOT = process.cwd();

function cleanFunctionDir(functionDir: string) {
  const functionName = functionDir.split('/').pop() ?? 'unknown';
  console.log(`   Cleaning ${functionName}...`);

  const nodeModulesDir = join(functionDir, 'node_modules');
  if (!existsSync(nodeModulesDir)) {
    return;
  }

  // Remove devDependencies
  console.log('      Removing devDependencies...');
  const devDeps = [
    'typescript',
    '@typescript-eslint',
    'eslint',
    '@eslint',
    '@eslint-community',
    '@types',
    'tsx',
    'pino-pretty',
    'globals'
  ];

  for (const dep of devDeps) {
    removeIfExists(join(nodeModulesDir, dep));
  }

  removeDirs('eslint*', nodeModulesDir);
  removeDirs('*typescript*', nodeModulesDir);

  // Remove sharp
  removeIfExists(join(nodeModulesDir, '@img'));
  removeIfExists(join(nodeModulesDir, 'sharp'));

  cleanNodeModules(nodeModulesDir, {
    apisIndexFallbackDirs: [
      join(PROJECT_ROOT, 'dist/node_modules'),
      join(PROJECT_ROOT, 'node_modules'),
    ],
    indent: '      ',
  });

  // Check size after cleanup
  const size = getSize(functionDir);
  console.log(`      Size: ${size.human} (${size.mb}MB)`);

  if (size.mb > 250) {
    console.log(`      ❌ ERROR: Package size (${size.mb}MB) exceeds 250MB limit!`);
    console.log('      This will cause deployment to fail. Please reduce dependencies or use Lambda Layers.');
    process.exit(1);
  } else if (size.mb > 200) {
    console.log(`      ⚠️  WARNING: Package size (${size.mb}MB) is close to 250MB limit`);
  } else {
    console.log('      ✅ Package size is within limits');
  }

  // Show breakdown of largest directories
  console.log('      Top dependencies:');
  try {
    const entries = readdirSync(nodeModulesDir)
      .map(name => ({
        name,
        path: join(nodeModulesDir, name),
        size: 0
      }))
      .filter(entry => {
        try {
          const stats = statSync(entry.path);
          return stats.isDirectory();
        } catch {
          return false;
        }
      });

    for (const entry of entries) {
      try {
        const sizeOutput = execSync(`du -sm "${entry.path}"`, { encoding: 'utf-8' }).trim();
        entry.size = parseInt(sizeOutput.split('\t')[0], 10);
      } catch {
        // Ignore errors
      }
    }

    entries
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .forEach(entry => {
        const sizeOutput = execSync(`du -sh "${entry.path}"`, { encoding: 'utf-8' }).trim();
        const sizeHuman = sizeOutput.split('\t')[0];
        console.log(`        ${sizeHuman.padStart(6)}  ${entry.name}`);
      });
  } catch {
    // Ignore errors
  }
}

console.log('Building application...');
exec('yarn build:lambda');
console.log('✅ Build complete');

console.log('');
console.log('Building with SAM (production mode)...');
process.env.NODEJS_PACKAGE_MANAGER = 'yarn';
process.env.NODE_ENV = 'production';
exec(`sam build --template-file "${join(PROJECT_ROOT, 'infrastructure/template.yaml')}"`);
console.log('✅ SAM build complete');

console.log('');
console.log('Cleaning up unused dependencies...');
console.log('Note: We only remove entire unused packages, never modify library internals');

const samBuildDir = join(PROJECT_ROOT, '.aws-sam/build');
if (existsSync(samBuildDir)) {
  const entries = readdirSync(samBuildDir);
  const functionDirs = entries
    .map(name => join(samBuildDir, name))
    .filter(path => {
      try {
        return statSync(path).isDirectory() && path.endsWith('Function');
      } catch {
        return false;
      }
    });

  for (const functionDir of functionDirs) {
    cleanFunctionDir(functionDir);
  }
}

console.log('');
console.log('✅ Cleanup complete');
