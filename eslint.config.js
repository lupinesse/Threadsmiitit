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
      'no-empty': 'error',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // React source files — browser ES modules with JSX.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-empty': 'error',
      'security/detect-object-injection': 'off',
    },
  },

  // Shared client/server field-normalization helpers — pure functions/regex
  // with no platform-specific globals, imported by both src/ (browser) and
  // netlify/functions/ (Node).
  {
    files: ['shared/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Only the globals genuinely common to both runtimes (e.g. TextEncoder) —
      // no fetch/Buffer/window/document, which is exactly the constraint this
      // block's file comment describes.
      globals: { TextEncoder: 'readonly', TextDecoder: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'error',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Netlify Functions — ES modules running in Node 18+ (fetch + Response are
  // built-in globals in the Netlify Functions v2 runtime).
  {
    files: ['netlify/functions/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'error',
      'security/detect-non-literal-fs-filename': 'off',
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
      'no-empty': 'error',
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
      'no-empty': 'error',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },

  {
    ignores: ['node_modules/', 'dist/'],
  },
];
