import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs'],
        },
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        args: 'after-used', // Only check arguments after the last used one
        ignoreRestSiblings: true, // Ignore rest siblings in destructuring
        caughtErrors: 'all', // Check unused catch clause variables
        caughtErrorsIgnorePattern: '^_', // Allow _ prefix for catch errors
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow non-null assertions when we've checked
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      
      // General rules
      'no-console': 'off', // Allow console for scripts
      'no-unused-vars': 'off', // Use TypeScript version instead
      'no-unused-private-class-members': 'error', // Detect unused private class methods, fields, and accessors
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'], // No one-line if statements - always require braces
      'brace-style': ['error', '1tbs'], // Consistent brace style
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-else-return': 'error', // Prefer early returns
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': 'error',
      'prefer-template': 'error',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/*.js',
      '**/*.d.ts',
      '.env',
      '.env.*',
      'src/types/**',
      '*.json',
    ],
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: false,
    },
  },
];

