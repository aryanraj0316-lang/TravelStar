/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  // jest-expo's preset already declares its own `setupFiles` (the RN native
  // module mock registry); a `setupFiles` entry here REPLACES rather than
  // merges with it, so the base preset's file has to be re-listed alongside
  // this project's own setup or NativeModules resolution breaks entirely.
  setupFiles: ['@react-native/jest-preset/jest/setup.js', '<rootDir>/jest.setup.js'],
  // Same replace-not-merge caveat applies to moduleNameMapper: jest-expo's
  // preset maps react-native-vector-icons to @expo/vector-icons, which is
  // re-declared here alongside the `@/*` alias Metro resolves natively from
  // tsconfig.json paths (Jest needs it spelled out explicitly).
  moduleNameMapper: {
    '^react-native-vector-icons$': '@expo/vector-icons',
    '^react-native-vector-icons/(.*)': '@expo/vector-icons/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
