/** Shared ESLint config for the Next.js frontend. */
module.exports = {
  extends: [require.resolve('./base.cjs'), 'next/core-web-vitals'],
  env: {
    browser: true,
    es2022: true,
    jest: true,
  },
};
