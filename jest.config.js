module.exports = {
  preset: 'jest-expo',
  cacheDirectory: '<rootDir>/.tmp/jest',
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'src/modules/**/*.{ts,tsx}',
    'src/shared/**/*.{ts,tsx}',
    'src/store/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/tests/**',
    '!src/shared/types/**',
    '!src/shared/db/database.ts',
    '!src/shared/design/theme.ts',
    '!src/shared/design/tokens.ts',
    '!src/modules/exercises/constants.ts',
    '!src/shared/config/feature-flags.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
