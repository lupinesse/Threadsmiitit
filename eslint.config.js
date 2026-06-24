import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  security.configs.recommended,

  // Build tooling — ES modules running in Node
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Extracted ES-module source files — imported directly by unit tests,
  // run in the browser context.
  {
    files: ['src/js/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'security/detect-object-injection': 'off',
    },
  },

  // CI dialogue scripts — ES modules running in Node (GitHub Actions).
  {
    files: ['.github/scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },

  // ESM unit tests — run with Node's built-in test runner.
  {
    files: ['test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },

  {
    ignores: ['node_modules/', 'dist/'],
  },
];
