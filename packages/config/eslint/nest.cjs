/** Shared ESLint config for the NestJS backend. */
module.exports = {
  extends: [require.resolve('./base.cjs')],
  parserOptions: {
    project: null,
  },
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/interface-name-prefix': 'off',
  },
};
