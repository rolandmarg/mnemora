#!/usr/bin/env node
/**
 * Package Lambda functions (build + SAM build + cleanup)
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
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
  
  // Remove unused googleapis API modules (tree shaking)
  // googleapis is modular - each API is a separate module
  // We only need calendar and sheets, so remove all others
  // CRITICAL: Must preserve apis/index.js file structure for module resolution
  console.log('      Removing unused googleapis API modules (tree shaking)...');
  const googleapisDir = join(nodeModulesDir, 'googleapis');
  if (existsSync(googleapisDir)) {
    const buildDir = join(googleapisDir, 'build');
    if (existsSync(buildDir)) {
      try {
        // The apis directory is at build/src/apis
        const apisDir = join(buildDir, 'src', 'apis');
        if (existsSync(apisDir)) {
          const apiDirs = execSync(`ls -1 "${apisDir}"`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
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
          console.log(`      ✅ Removed ${removedApis.length} unused API modules (kept: ${apisToKeep.join(', ')})`);
          
          // Edit apis/index.js to remove require statements and exports for deleted APIs
          const apisIndexPath = join(apisDir, 'index.js');
          
          // Ensure apis/index.js exists - copy from original or dist if missing
          if (!existsSync(apisIndexPath)) {
            // Try to find it in dist first (from our build), then in project root
            const distIndexPath = join(PROJECT_ROOT, 'dist/node_modules/googleapis/build/src/apis/index.js');
            const originalIndexPath = join(PROJECT_ROOT, 'node_modules/googleapis/build/src/apis/index.js');
            
            if (existsSync(distIndexPath)) {
              const originalContent = readFileSync(distIndexPath, 'utf-8');
              writeFileSync(apisIndexPath, originalContent, 'utf-8');
              console.log('      ✅ Restored apis/index.js from dist package');
            } else if (existsSync(originalIndexPath)) {
              const originalContent = readFileSync(originalIndexPath, 'utf-8');
              writeFileSync(apisIndexPath, originalContent, 'utf-8');
              console.log('      ✅ Restored apis/index.js from original package');
            } else {
              console.log('      ⚠️  Warning: apis/index.js not found, skipping tree shaking edit');
              // Skip tree shaking if we can't find the index file - don't remove APIs
              removedApis.length = 0;
            }
          }
          
          if (existsSync(apisIndexPath) && removedApis.length > 0) {
            console.log('      Editing apis/index.js to remove references to deleted APIs...');
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
              console.log('      ⚠️  Warning: apis/index.js too small after editing, restoring original...');
              indexContent = originalContent;
            } else if (!indexContent.includes('exports.APIS = {')) {
              console.log('      ⚠️  Warning: apis/index.js structure corrupted (missing exports.APIS), restoring original...');
              indexContent = originalContent;
            } else if (!indexContent.includes('class GeneratedAPIs')) {
              console.log('      ⚠️  Warning: apis/index.js structure corrupted (missing GeneratedAPIs class), restoring original...');
              indexContent = originalContent;
            } else {
              // Validate syntax by checking for calendar and sheets (should still be present)
              if (!indexContent.includes('calendar_1') || !indexContent.includes('sheets_1')) {
                console.log('      ⚠️  Warning: Required APIs missing from apis/index.js, restoring original...');
                indexContent = originalContent;
              } else {
                writeFileSync(apisIndexPath, indexContent, 'utf-8');
                console.log(`      ✅ Updated apis/index.js to remove ${removedApis.length} deleted API references`);
              }
            }
          }
          
          // CRITICAL: Also edit the main index.js file to remove require statements for deleted APIs
          // The main index.js file has require statements like: var v1_1 = require("./apis/abusiveexperiencereport/v1");
          const mainIndexPath = join(buildDir, 'src', 'index.js');
          if (existsSync(mainIndexPath) && removedApis.length > 0) {
            console.log('      Editing main index.js to remove references to deleted APIs...');
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
            const reductionPercent = originalLength > 0 ? ((originalLength - newLength) / originalLength) * 100 : 0;
            
            // Validate: Check that the file still has valid structure
            // After removing many APIs, we expect significant reduction but file should still be substantial
            if (newLength < originalLength * 0.1) {
              console.log(`      ⚠️  Warning: main index.js too small after editing (${newLength} bytes, ${reductionPercent.toFixed(1)}% reduction), restoring original...`);
              mainIndexContent = originalMainContent;
            } else if (!mainIndexContent.includes('exports.google')) {
              console.log('      ⚠️  Warning: main index.js structure corrupted (missing exports.google), restoring original...');
              mainIndexContent = originalMainContent;
            } else if (!mainIndexContent.includes('require("./googleapis")')) {
              console.log('      ⚠️  Warning: main index.js structure corrupted (missing googleapis require), restoring original...');
              mainIndexContent = originalMainContent;
            } else {
              // Validate that calendar and sheets are still present
              if (!mainIndexContent.includes('calendar_v3') || !mainIndexContent.includes('sheets_v4')) {
                console.log('      ⚠️  Warning: Required APIs missing from main index.js, restoring original...');
                mainIndexContent = originalMainContent;
              } else {
                writeFileSync(mainIndexPath, mainIndexContent, 'utf-8');
                console.log(`      ✅ Updated main index.js: removed ${totalRemoved} API references (${reductionPercent.toFixed(1)}% size reduction)`);
              }
            }
          }
        }
        
        // Remove generator directory (not needed at runtime)
        const generatorDir = join(buildDir, 'src', 'generator');
        if (existsSync(generatorDir)) {
          removeIfExists(generatorDir);
          console.log('      ✅ Removed googleapis generator directory');
        }
        
        // Remove source TypeScript files (only need compiled JS)
        const srcDir = join(buildDir, 'src');
        if (existsSync(srcDir)) {
          removeFiles('*.ts', srcDir);
          console.log('      ✅ Removed TypeScript source files from googleapis');
        }
      } catch (error) {
        console.log(`      ⚠️  Could not perform googleapis tree shaking: ${error instanceof Error ? error.message : String(error)}`);
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

