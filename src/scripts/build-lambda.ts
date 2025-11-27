#!/usr/bin/env node
/**
 * Build script for Lambda deployment
 * Builds TypeScript, installs production dependencies, and cleans up unnecessary files
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
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
// Note: Not using --immutable because dist/ is a build artifact and lockfile may need updates
console.log('Installing dependencies in dist...');
exec('NODE_ENV=production YARN_ENABLE_SCRIPTS=false yarn install', {
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
  
  // Remove unused googleapis API modules (tree shaking)
  // googleapis is modular - each API is a separate module
  // We only need calendar and sheets, so remove all others
  // CRITICAL: Must preserve apis/index.js file structure for module resolution
  console.log('   Removing unused googleapis API modules (tree shaking)...');
  const googleapisDir = join(distNodeModules, 'googleapis');
  if (existsSync(googleapisDir)) {
    const buildDir = join(googleapisDir, 'build');
    if (existsSync(buildDir)) {
      try {
        // The apis directory is at build/src/apis
        const apisDir = join(buildDir, 'src', 'apis');
        if (existsSync(apisDir)) {
          // List all API directories
          const apiDirs = execSync(`ls -1 "${apisDir}"`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
          // Keep only calendar and sheets
          const apisToKeep = ['calendar', 'sheets'];
          const removedApis: string[] = [];
          for (const apiDir of apiDirs) {
            if (!apisToKeep.includes(apiDir)) {
              const apiPath = join(apisDir, apiDir);
              if (existsSync(apiPath)) {
                removeIfExists(apiPath);
                removedApis.push(apiDir);
              }
            }
          }
          console.log(`   ✅ Removed ${removedApis.length} unused API modules (kept: ${apisToKeep.join(', ')})`);
          
          // Edit apis/index.js to remove require statements and exports for deleted APIs
          const apisIndexPath = join(apisDir, 'index.js');
          
          // Ensure apis/index.js exists - copy from original if missing
          if (!existsSync(apisIndexPath)) {
            const originalIndexPath = join(PROJECT_ROOT, 'node_modules/googleapis/build/src/apis/index.js');
            if (existsSync(originalIndexPath)) {
              const originalContent = readFileSync(originalIndexPath, 'utf-8');
              writeFileSync(apisIndexPath, originalContent, 'utf-8');
              console.log('   ✅ Restored apis/index.js from original package');
            } else {
              console.log('   ⚠️  Warning: apis/index.js not found in original package, skipping tree shaking');
              removedApis.length = 0; // Skip tree shaking if we can't find the original
            }
          }
          
          if (existsSync(apisIndexPath) && removedApis.length > 0) {
            console.log('   Editing apis/index.js to remove references to deleted APIs...');
            let indexContent = readFileSync(apisIndexPath, 'utf-8');
            const originalContent = indexContent;
            
            // Remove require statements for deleted APIs
            // Format: const apiName_1 = require("./apiName");
            for (const api of removedApis) {
              const escapedApi = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              // Match entire line with require statement (including any whitespace)
              const requirePattern = new RegExp(`^\\s*const\\s+${escapedApi}_1\\s*=\\s*require\\(["']\\./${escapedApi}["']\\);\\s*$`, 'gm');
              indexContent = indexContent.replace(requirePattern, '');
            }
            
            // Remove entries from exports.APIS object
            // Format: apiName: apiName_1.VERSIONS, (with or without trailing comma)
            for (const api of removedApis) {
              const escapedApi = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              // Match line with APIS export entry - handle trailing comma carefully
              const apisExportPattern = new RegExp(`^\\s+${escapedApi}:\\s+${escapedApi}_1\\.VERSIONS,?\\s*$`, 'gm');
              indexContent = indexContent.replace(apisExportPattern, '');
            }
            
            // Remove properties from GeneratedAPIs class
            // Format: apiName = apiName_1.apiName; (with or without semicolon)
            for (const api of removedApis) {
              const escapedApi = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              // Match line with class property
              const apiPropertyPattern = new RegExp(`^\\s+${escapedApi}\\s*=\\s+${escapedApi}_1\\.${escapedApi};?\\s*$`, 'gm');
              indexContent = indexContent.replace(apiPropertyPattern, '');
            }
            
            // Validate: Check that the file still has valid structure
            if (indexContent.length < 1000) {
              console.log('   ⚠️  Warning: apis/index.js too small after editing, restoring original...');
              indexContent = originalContent;
            } else if (!indexContent.includes('exports.APIS = {')) {
              console.log('   ⚠️  Warning: apis/index.js structure corrupted (missing exports.APIS), restoring original...');
              indexContent = originalContent;
            } else if (!indexContent.includes('class GeneratedAPIs')) {
              console.log('   ⚠️  Warning: apis/index.js structure corrupted (missing GeneratedAPIs class), restoring original...');
              indexContent = originalContent;
            } else {
              // Validate syntax by checking for calendar and sheets (should still be present)
              if (!indexContent.includes('calendar_1') || !indexContent.includes('sheets_1')) {
                console.log('   ⚠️  Warning: Required APIs missing from apis/index.js, restoring original...');
                indexContent = originalContent;
              } else {
                writeFileSync(apisIndexPath, indexContent, 'utf-8');
                console.log(`   ✅ Updated apis/index.js to remove ${removedApis.length} deleted API references`);
              }
            }
          }
          
          // CRITICAL: Also edit the main index.js file to remove require statements for deleted APIs
          // The main index.js file has require statements like: var v1_1 = require("./apis/abusiveexperiencereport/v1");
          const mainIndexPath = join(buildDir, 'src', 'index.js');
          if (existsSync(mainIndexPath) && removedApis.length > 0) {
            console.log('   Editing main index.js to remove references to deleted APIs...');
            let mainIndexContent = readFileSync(mainIndexPath, 'utf-8');
            const originalMainContent = mainIndexContent;
            const originalLength = mainIndexContent.length;
            
            // For each deleted API, find and remove:
            // 1. The require statement: var v1_1 = require("./apis/apiName/v1");
            // 2. The export statement: Object.defineProperty(exports, "apiName_v1", ...);
            // 3. The export in the top-level exports list
            
            let totalRemoved = 0;
            for (const api of removedApis) {
              const escapedApi = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              
              // Find all require statements for this API and their corresponding exports
              // Pattern: var v1_1 = require("./apis/abusiveexperiencereport/v1");
              // Followed by: Object.defineProperty(exports, "abusiveexperiencereport_v1", ...);
              
              // Match require statements - extract variable name and version
              const requirePattern = new RegExp(`var\\s+(\\w+)\\s*=\\s*require\\(["']\\./apis/${escapedApi}/([^"']+)["']\\);`, 'g');
              let requireMatch;
              const apiExports: Array<{ varName: string; exportName: string }> = [];
              
              while ((requireMatch = requirePattern.exec(mainIndexContent)) !== null) {
                const varName = requireMatch[1];
                const version = requireMatch[2];
                // Export name is typically: apiName_version (e.g., abusiveexperiencereport_v1)
                const exportName = `${api}_${version}`;
                apiExports.push({ varName, exportName });
              }
              
              if (apiExports.length > 0) {
                totalRemoved += apiExports.length;
              }
              
              // Remove require statements (with newline after)
              mainIndexContent = mainIndexContent.replace(
                new RegExp(`var\\s+\\w+\\s*=\\s*require\\(["']\\./apis/${escapedApi}/[^"']+["']\\);\\s*\\n?`, 'g'),
                ''
              );
              
              // Remove Object.defineProperty exports for this API
              for (const { varName, exportName } of apiExports) {
                const escapedExportName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Match: Object.defineProperty(exports, "abusiveexperiencereport_v1", { enumerable: true, get: function () { return v1_1.abusiveexperiencereport_v1; } });
                const definePropertyPattern = new RegExp(
                  `Object\\.defineProperty\\(exports,\\s*["']${escapedExportName}["'],\\s*\\{[^}]*get:\\s*function\\s*\\(\\)\\s*\\{\\s*return\\s+${varName}\\.[^}]+\\}\\s*\\}\\);\\s*\\n?`,
                  'g'
                );
                mainIndexContent = mainIndexContent.replace(definePropertyPattern, '');
              }
              
              // Note: We don't remove from top-level export list because:
              // 1. The exports are chained (exports.a = exports.b = exports.c = void 0)
              // 2. Removing parts of the chain is complex and error-prone
              // 3. The require() and Object.defineProperty removals are sufficient to prevent import errors
              // 4. The top-level exports are just for convenience, not required for runtime
            }
            
            const newLength = mainIndexContent.length;
            const reductionPercent = ((originalLength - newLength) / originalLength) * 100;
            
            // Validate: Check that the file still has valid structure
            // After removing 318 APIs, we expect significant reduction but file should still be substantial
            if (newLength < originalLength * 0.1) {
              console.log(`   ⚠️  Warning: main index.js too small after editing (${newLength} bytes, ${reductionPercent.toFixed(1)}% reduction), restoring original...`);
              mainIndexContent = originalMainContent;
            } else if (!mainIndexContent.includes('exports.google')) {
              console.log('   ⚠️  Warning: main index.js structure corrupted (missing exports.google), restoring original...');
              mainIndexContent = originalMainContent;
            } else if (!mainIndexContent.includes('require("./googleapis")')) {
              console.log('   ⚠️  Warning: main index.js structure corrupted (missing googleapis require), restoring original...');
              mainIndexContent = originalMainContent;
            } else {
              // Validate that calendar and sheets are still present
              if (!mainIndexContent.includes('calendar_v3') || !mainIndexContent.includes('sheets_v4')) {
                console.log('   ⚠️  Warning: Required APIs missing from main index.js, restoring original...');
                mainIndexContent = originalMainContent;
              } else {
                writeFileSync(mainIndexPath, mainIndexContent, 'utf-8');
                console.log(`   ✅ Updated main index.js: removed ${totalRemoved} API references (${reductionPercent.toFixed(1)}% size reduction)`);
              }
            }
          }
        }
        
        // Remove generator directory (not needed at runtime)
        const generatorDir = join(buildDir, 'src', 'generator');
        if (existsSync(generatorDir)) {
          removeIfExists(generatorDir);
          console.log('   ✅ Removed googleapis generator directory');
        }
        
        // Remove source TypeScript files (only need compiled JS)
        const srcDir = join(buildDir, 'src');
        if (existsSync(srcDir)) {
          removeFiles('*.ts', srcDir);
          console.log('   ✅ Removed TypeScript source files from googleapis');
        }
      } catch (error) {
        console.log(`   ⚠️  Could not perform googleapis tree shaking: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Remove other unnecessary files from googleapis root
    removeFiles('*.md', googleapisDir);
    removeFiles('*.ts', googleapisDir);
    removeDirs('test', googleapisDir);
    removeDirs('tests', googleapisDir);
    removeDirs('docs', googleapisDir);
    removeDirs('examples', googleapisDir);
    
    // Clean up nested node_modules in googleapis (keep only what's needed)
    const googleapisNodeModules = join(googleapisDir, 'node_modules');
    if (existsSync(googleapisNodeModules)) {
      // Remove unnecessary files from nested dependencies
      removeFiles('*.md', googleapisNodeModules);
      removeFiles('*.ts', googleapisNodeModules);
      removeFiles('*.d.ts', googleapisNodeModules);
      removeDirs('test', googleapisNodeModules);
      removeDirs('tests', googleapisNodeModules);
      removeDirs('docs', googleapisNodeModules);
      removeDirs('examples', googleapisNodeModules);
    }
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

