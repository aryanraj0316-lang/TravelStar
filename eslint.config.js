// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsParser = require('@typescript-eslint/parser');

module.exports = defineConfig([
  expoConfig,
  {
    // scripts/** holds plain Node CommonJS tooling (e.g.
    // generate-licenses.js) — same reason eslint.config.js itself is
    // exempted: __dirname/require aren't configured as globals for the
    // app-source TS/TSX rules below, and these aren't app source.
    ignores: ['dist/*', 'backend/**', 'eslint.config.js', 'scripts/**', 'jest.config.js', 'jest.setup.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      'no-console': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]);
