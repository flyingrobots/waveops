module.exports = {
  extends: ['../eslint.config.js'],
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  globals: {
    test: 'readonly',
    expect: 'readonly',
    describe: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly',
    jest: 'readonly'
  },
  rules: {
    // Allow unused parameters in test files for clarity
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_' 
    }],
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_' 
    }],
    // Allow console in tests
    'no-console': 'off'
  }
};