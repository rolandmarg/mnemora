/**
 * Shared cleanup utilities for Lambda build scripts.
 * Used by both build-lambda.ts and package-lambda.ts.
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();

export function exec(command: string, options?: { cwd?: string; stdio?: 'inherit' | 'pipe' }) {
  console.log(`Running: ${command}`);
  execSync(command, {
    cwd: options?.cwd ?? PROJECT_ROOT,
    stdio: options?.stdio ?? 'inherit',
    encoding: 'utf-8'
  });
}

export function removeIfExists(path: string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

export function removeFiles(pattern: string, baseDir: string) {
  try {
    execSync(`find "${baseDir}" -name "${pattern}" -delete`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
}

export function removeDirs(pattern: string, baseDir: string) {
  try {
    execSync(`find "${baseDir}" -type d -name "${pattern}" -exec rm -rf {} +`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
}

export function getSize(dir: string): { human: string; mb: number } {
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

const AUDIO_DECODERS = [
  '@wasm-audio-decoders',
  'node-wav',
  'ogg-opus-decoder',
  'audio-decode',
  'audio-buffer',
  'audio-type'
];

const UNUSED_AWS_PROVIDERS = [
  '@aws-sdk/credential-provider-ini',
  '@aws-sdk/credential-provider-sso',
  '@aws-sdk/credential-provider-login',
  '@aws-sdk/credential-provider-process',
  '@aws-sdk/credential-provider-web-identity',
  '@aws-sdk/credential-provider-http',
  '@aws-sdk/client-sso'
];

const APIS_TO_KEEP = ['sheets'];

/**
 * Tree-shake googleapis: remove unused API modules and patch index files.
 * @param nodeModulesDir - path to the node_modules directory being cleaned
 * @param apisIndexFallbackDirs - ordered list of directories to search for a fallback apis/index.js
 * @param indent - log indentation prefix
 */
function treeShakeGoogleapis(nodeModulesDir: string, apisIndexFallbackDirs: string[], indent: string) {
  const googleapisDir = join(nodeModulesDir, 'googleapis');
  if (!existsSync(googleapisDir)) {
    return;
  }

  const buildDir = join(googleapisDir, 'build');
  if (!existsSync(buildDir)) {
    return;
  }

  try {
    const apisDir = join(buildDir, 'src', 'apis');
    if (!existsSync(apisDir)) {
      return;
    }

    // List all API directories and remove ones we don't need
    const apiDirs = execSync(`ls -1 "${apisDir}"`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const removedApis: string[] = [];
    for (const apiDir of apiDirs) {
      if (!APIS_TO_KEEP.includes(apiDir)) {
        const apiPath = join(apisDir, apiDir);
        if (existsSync(apiPath)) {
          removeIfExists(apiPath);
          removedApis.push(apiDir);
        }
      }
    }
    console.log(`${indent}✅ Removed ${removedApis.length} unused API modules (kept: ${APIS_TO_KEEP.join(', ')})`);

    // Patch apis/index.js
    const apisIndexPath = join(apisDir, 'index.js');

    // Restore apis/index.js from fallback if missing
    if (!existsSync(apisIndexPath)) {
      let restored = false;
      for (const fallbackDir of apisIndexFallbackDirs) {
        const fallbackPath = join(fallbackDir, 'googleapis/build/src/apis/index.js');
        if (existsSync(fallbackPath)) {
          writeFileSync(apisIndexPath, readFileSync(fallbackPath, 'utf-8'), 'utf-8');
          console.log(`${indent}✅ Restored apis/index.js from fallback`);
          restored = true;
          break;
        }
      }
      if (!restored) {
        console.log(`${indent}⚠️  Warning: apis/index.js not found, skipping tree shaking edit`);
        removedApis.length = 0;
      }
    }

    if (existsSync(apisIndexPath) && removedApis.length > 0) {
      console.log(`${indent}Editing apis/index.js to remove references to deleted APIs...`);
      let indexContent = readFileSync(apisIndexPath, 'utf-8');
      const originalContent = indexContent;

      for (const api of removedApis) {
        const escapedApi = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const requirePattern = new RegExp(`^\\s*const\\s+${escapedApi}_1\\s*=\\s*require\\(["']\\./${escapedApi}["']\\);\\s*$`, 'gm');
        indexContent = indexContent.replace(requirePattern, '');

        const apisExportPattern = new RegExp(`^\\s+${escapedApi}:\\s+${escapedApi}_1\\.VERSIONS,?\\s*$`, 'gm');
        indexContent = indexContent.replace(apisExportPattern, '');

        const apiPropertyPattern = new RegExp(`^\\s+${escapedApi}\\s*=\\s+${escapedApi}_1\\.${escapedApi};?\\s*$`, 'gm');
        indexContent = indexContent.replace(apiPropertyPattern, '');
      }

      // Validate structure
      if (indexContent.length < 1000) {
        console.log(`${indent}⚠️  Warning: apis/index.js too small after editing, restoring original...`);
        indexContent = originalContent;
      } else if (!indexContent.includes('exports.APIS = {')) {
        console.log(`${indent}⚠️  Warning: apis/index.js structure corrupted (missing exports.APIS), restoring original...`);
        indexContent = originalContent;
      } else if (!indexContent.includes('class GeneratedAPIs')) {
        console.log(`${indent}⚠️  Warning: apis/index.js structure corrupted (missing GeneratedAPIs class), restoring original...`);
        indexContent = originalContent;
      } else if (!indexContent.includes('sheets_1')) {
        console.log(`${indent}⚠️  Warning: Required APIs missing from apis/index.js, restoring original...`);
        indexContent = originalContent;
      } else {
        writeFileSync(apisIndexPath, indexContent, 'utf-8');
        console.log(`${indent}✅ Updated apis/index.js to remove ${removedApis.length} deleted API references`);
      }
    }

    // Patch main index.js
    const mainIndexPath = join(buildDir, 'src', 'index.js');
    if (existsSync(mainIndexPath) && removedApis.length > 0) {
      console.log(`${indent}Editing main index.js to remove references to deleted APIs...`);
      let mainIndexContent = readFileSync(mainIndexPath, 'utf-8');
      const originalMainContent = mainIndexContent;
      const originalLength = mainIndexContent.length;

      let totalRemoved = 0;
      for (const api of removedApis) {
        const escapedApi = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const requirePattern = new RegExp(`var\\s+(\\w+)\\s*=\\s*require\\(["']\\./apis/${escapedApi}/([^"']+)["']\\);`, 'g');
        let requireMatch;
        const apiExports: Array<{ varName: string; exportName: string }> = [];

        requirePattern.lastIndex = 0;
        while ((requireMatch = requirePattern.exec(mainIndexContent)) !== null) {
          apiExports.push({ varName: requireMatch[1], exportName: `${api}_${requireMatch[2]}` });
        }

        if (apiExports.length > 0) {
          totalRemoved += apiExports.length;
        }

        mainIndexContent = mainIndexContent.replace(
          new RegExp(`^\\s*var\\s+\\w+\\s*=\\s*require\\(["']\\./apis/${escapedApi}/[^"']+["']\\);\\s*\\r?\\n?`, 'gm'),
          ''
        );

        for (const { varName, exportName } of apiExports) {
          const escapedExportName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const definePropertyPattern = new RegExp(
            `^\\s*Object\\.defineProperty\\(exports,\\s*["']${escapedExportName}["'],\\s*\\{[^}]*get:\\s*function\\s*\\(\\)\\s*\\{\\s*return\\s+${varName}\\.[^}]+\\}\\s*\\}\\);\\s*\\r?\\n?`,
            'gm'
          );
          mainIndexContent = mainIndexContent.replace(definePropertyPattern, '');
        }
      }

      const newLength = mainIndexContent.length;
      const reductionPercent = originalLength > 0 ? ((originalLength - newLength) / originalLength) * 100 : 0;

      if (newLength < originalLength * 0.1) {
        console.log(`${indent}⚠️  Warning: main index.js too small after editing (${newLength} bytes, ${reductionPercent.toFixed(1)}% reduction), restoring original...`);
        mainIndexContent = originalMainContent;
      } else if (!mainIndexContent.includes('exports.google')) {
        console.log(`${indent}⚠️  Warning: main index.js structure corrupted (missing exports.google), restoring original...`);
        mainIndexContent = originalMainContent;
      } else if (!mainIndexContent.includes('require("./googleapis")')) {
        console.log(`${indent}⚠️  Warning: main index.js structure corrupted (missing googleapis require), restoring original...`);
        mainIndexContent = originalMainContent;
      } else if (!mainIndexContent.includes('sheets_v4')) {
        console.log(`${indent}⚠️  Warning: Required APIs missing from main index.js, restoring original...`);
        mainIndexContent = originalMainContent;
      } else {
        writeFileSync(mainIndexPath, mainIndexContent, 'utf-8');
        console.log(`${indent}✅ Updated main index.js: removed ${totalRemoved} API references (${reductionPercent.toFixed(1)}% size reduction)`);
      }
    }

    // Remove generator directory (not needed at runtime)
    const generatorDir = join(buildDir, 'src', 'generator');
    if (existsSync(generatorDir)) {
      removeIfExists(generatorDir);
      console.log(`${indent}✅ Removed googleapis generator directory`);
    }

    // Remove source TypeScript files (only need compiled JS)
    const srcDir = join(buildDir, 'src');
    if (existsSync(srcDir)) {
      removeFiles('*.ts', srcDir);
      console.log(`${indent}✅ Removed TypeScript source files from googleapis`);
    }
  } catch (error) {
    console.log(`${indent}⚠️  Could not perform googleapis tree shaking: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Remove other unnecessary files from googleapis root
  removeFiles('*.md', googleapisDir);
  removeFiles('*.ts', googleapisDir);
  removeDirs('test', googleapisDir);
  removeDirs('tests', googleapisDir);
  removeDirs('docs', googleapisDir);
  removeDirs('examples', googleapisDir);

  // Clean up nested node_modules in googleapis
  const googleapisNodeModules = join(googleapisDir, 'node_modules');
  if (existsSync(googleapisNodeModules)) {
    removeFiles('*.md', googleapisNodeModules);
    removeFiles('*.ts', googleapisNodeModules);
    removeFiles('*.d.ts', googleapisNodeModules);
    removeDirs('test', googleapisNodeModules);
    removeDirs('tests', googleapisNodeModules);
    removeDirs('docs', googleapisNodeModules);
    removeDirs('examples', googleapisNodeModules);
  }
}

/**
 * Clean a node_modules directory: remove dev deps, audio decoders, unused AWS providers,
 * tree-shake googleapis, and strip documentation/source files.
 *
 * @param nodeModulesDir - absolute path to the node_modules directory to clean
 * @param options.apisIndexFallbackDirs - ordered fallback dirs to restore googleapis apis/index.js from
 * @param options.indent - log indentation prefix (default: '   ')
 */
export function cleanNodeModules(
  nodeModulesDir: string,
  options?: {
    apisIndexFallbackDirs?: string[];
    indent?: string;
  }
) {
  const indent = options?.indent ?? '   ';
  const fallbackDirs = options?.apisIndexFallbackDirs ?? [join(PROJECT_ROOT, 'node_modules')];

  if (!existsSync(nodeModulesDir)) {
    return;
  }

  // Clean up .bin directories
  console.log(`${indent}Cleaning up .bin directories (CLI tools not needed in Lambda)...`);
  try {
    execSync(`find "${nodeModulesDir}" -type d -name ".bin" -exec sh -c 'for link in "$1"/*; do [ -L "$link" ] && [ ! -e "$link" ] && rm -f "$link"; done' _ {} \\;`, {
      stdio: 'pipe'
    });
  } catch {
    // Ignore errors
  }
  removeDirs('.bin', nodeModulesDir);

  // Remove audio decoders
  console.log(`${indent}Removing audio decoders (not needed with Baileys 6.7.21)...`);
  for (const decoder of AUDIO_DECODERS) {
    removeIfExists(join(nodeModulesDir, decoder));
  }

  // Remove unused AWS SDK credential providers
  console.log(`${indent}Removing unused AWS SDK credential providers...`);
  for (const provider of UNUSED_AWS_PROVIDERS) {
    removeIfExists(join(nodeModulesDir, provider));
  }

  // Tree-shake googleapis
  console.log(`${indent}Removing unused googleapis API modules (tree shaking)...`);
  treeShakeGoogleapis(nodeModulesDir, fallbackDirs, indent);

  // Remove TypeScript definition files
  console.log(`${indent}Removing TypeScript definition files...`);
  removeFiles('*.d.ts', nodeModulesDir);

  // Remove source maps and other unnecessary files
  console.log(`${indent}Removing source maps and documentation...`);
  removeFiles('*.map', nodeModulesDir);
  removeFiles('*.md', nodeModulesDir);
  removeFiles('CHANGELOG*', nodeModulesDir);
  removeFiles('LICENSE*', nodeModulesDir);
  removeDirs('test', nodeModulesDir);
  removeDirs('tests', nodeModulesDir);
  removeDirs('__tests__', nodeModulesDir);
  removeDirs('docs', nodeModulesDir);
  removeDirs('examples', nodeModulesDir);

  console.log(`${indent}✅ Cleanup complete`);
}
