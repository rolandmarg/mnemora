#!/usr/bin/env node
/**
 * Package Lambda functions (build + SAM build + cleanup)
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();

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
    'vitest',
    '@vitest',
    'tsx',
    'pino-pretty',
    'globals'
  ];
  
  for (const dep of devDeps) {
    removeIfExists(join(nodeModulesDir, dep));
  }
  
  removeDirs('eslint*', nodeModulesDir);
  removeDirs('*typescript*', nodeModulesDir);
  
  // Clean up .bin directories
  console.log('      Cleaning up .bin directories (CLI tools not needed in Lambda)...');
  try {
    execSync(`find "${nodeModulesDir}" -type d -name ".bin" -exec sh -c 'for link in "$1"/*; do [ -L "$link" ] && [ ! -e "$link" ] && rm -f "$link"; done' _ {} \\;`, {
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
  removeDirs('.bin', nodeModulesDir);
  
  // Remove audio decoders
  console.log('      Removing audio decoders (not needed with Baileys 6.7.21)...');
  const audioDecoders = [
    '@wasm-audio-decoders',
    'node-wav',
    'ogg-opus-decoder',
    'audio-decode',
    'audio-buffer',
    'audio-type'
  ];
  
  for (const decoder of audioDecoders) {
    removeIfExists(join(nodeModulesDir, decoder));
  }
  
  // Remove unused AWS SDK credential providers
  console.log('      Removing unused AWS SDK credential providers...');
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
    removeIfExists(join(nodeModulesDir, provider));
  }
  
  // Remove sharp
  removeIfExists(join(nodeModulesDir, '@img'));
  removeIfExists(join(nodeModulesDir, 'sharp'));
  
  // Remove TypeScript definition files
  console.log('      Removing TypeScript definition files...');
  removeFiles('*.d.ts', nodeModulesDir);
  
  // Remove source maps and other unnecessary files
  removeFiles('*.map', nodeModulesDir);
  removeFiles('*.md', nodeModulesDir);
  removeFiles('CHANGELOG*', nodeModulesDir);
  removeFiles('LICENSE*', nodeModulesDir);
  removeDirs('test', nodeModulesDir);
  removeDirs('tests', nodeModulesDir);
  removeDirs('__tests__', nodeModulesDir);
  removeDirs('docs', nodeModulesDir);
  removeDirs('examples', nodeModulesDir);
  
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

