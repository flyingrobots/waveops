import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // BAN any type - treat as ERROR
      '@typescript-eslint/no-explicit-any': 'error',
      
      // Core TypeScript rules
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      
      // General strict rules  
      'no-console': 'error', // Ban console.log in production code
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': 'error',
      'no-eval': 'error'
    }
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        'describe': 'readonly',
        'it': 'readonly',
        'expect': 'readonly',
        'jest': 'readonly',
        'beforeEach': 'readonly',
        'afterEach': 'readonly',
        '__dirname': 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // BAN any type - treat as ERROR (but allow in tests for mocking)
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // Relaxed rules for tests
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      'no-console': 'off', // Allow console in tests
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': 'error'
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '**/*.js', 'eslint.config.js']
  }
];