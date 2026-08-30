const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.next/', '<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^@cvlab/ui$': '<rootDir>/../../packages/ui/src/index.ts',
    '^@cvlab/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@cvlab/resume-renderer$': '<rootDir>/../../packages/resume-renderer/src/index.ts',
  },
};

module.exports = createJestConfig(customJestConfig);
