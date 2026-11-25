/** Container-only build configuration. */
module.exports = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: { unoptimized: true },
  outputFileTracingIncludes: {
    '/*': ['./node_modules/.prisma/client/**/*'],
  },
};
