const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['release-control.cjs', 'dist/**', 'node_modules/**', 'export-temp/**', 'android-privacy-export/**', 'eas-cli-cache/**', 'jest-cache/**', 'eslint.config.js', 'jest.config.js'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  }
);
