import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const withMDX = createMDX();

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    // Node 24 resolves @swc/helpers through module-sync, but Next 15 does not trace all ESM helpers.
    '*': [
      './node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*',
      '../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*',
    ],
  },
  reactStrictMode: true,
  compress: true,
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: '/deploy/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/plain; charset=utf-8',
          },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    dangerouslyAllowSVG: true,
    domains: ['oss.laf.run', 'static.ppinfra.com', 'cdn.jsdelivr.net'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oss.laf.run',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static.ppinfra.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withMDX(config);
