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
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow non-null assertions when we've checked
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      
      // General rules
      'no-console': 'off', // Allow console for scripts
      'no-unused-vars': 'off', // Use TypeScript version instead
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'], // No one-line if statements - always require braces
      'brace-style': ['error', '1tbs'], // Consistent brace style
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-else-return': 'warn', // Prefer early returns
      'prefer-arrow-callback': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],
      'object-shorthand': 'warn',
      'prefer-template': 'warn',
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
    ],
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: false,
    },
  },
];

