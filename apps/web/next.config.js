/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets Next's own compiler transpile our workspace TS packages directly —
  // no separate build step needed for @cvlab/ui / @cvlab/types during dev.
  transpilePackages: ['@cvlab/ui', '@cvlab/types'],
};

module.exports = nextConfig;
