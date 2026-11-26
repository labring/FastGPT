import type { NextConfig } from 'next';
import path from 'path';

import { webEnv } from '@fastgpt/web/env';

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), microphone=(self), camera=(self)'
  }
];

const noIndexHeaders = [
  {
    key: 'X-Robots-Tag',
    value: 'noindex, nofollow'
  }
];

const optimizedPackageImports = [
  '@chakra-ui/react',
  '@chakra-ui/icons',
  'framer-motion',
  '@emotion/react',
  '@emotion/styled'
];

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: webEnv.NEXT_PUBLIC_BASE_URL || undefined,
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === 'true'
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-Hant', 'ko-KR'],
    localeDetection: false
  },
  output: 'standalone',
  // Strict Mode is development-only; keep it disabled until double-render unsafe code is migrated.
  reactStrictMode: false,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/((?!chat/share$).*)',
        headers: securityHeaders
      },
      {
        source: '/apidoc/:path*',
        headers: noIndexHeaders
      },
      {
        source: '/api/apidoc/:path*',
        headers: noIndexHeaders
      }
    ];
  },
  turbopack: {
    root: path.join(__dirname, '../../'),
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js'
      }
    }
  },
  // i18next v26 的浏览器产物含 Safari 13.0 不支持的语法，交给 Next.js 按 browserslist 降级。
  transpilePackages: ['@modelcontextprotocol/sdk', 'ahooks', 'i18next'],
  serverExternalPackages: [
    '@node-rs/jieba',
    'bullmq',
    '@zilliz/milvus2-sdk-node',
    '@opentelemetry/api-logs',
    '@mariozechner/pi-agent-core',
    '@mariozechner/pi-ai',
    '@fastgpt-plugin/sdk-client'
  ],
  // 优化大库的 barrel exports tree-shaking
  experimental: {
    optimizePackageImports: optimizedPackageImports,
    // 减少内存占用
    memoryBasedWorkersCount: true,

    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    // Node 24 resolves @swc/helpers through module-sync, but Next 16.3 does not trace all ESM helpers.
    '*': ['../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*']
  },
  // Exclude build-time-only packages from standalone output file tracing
  outputFileTracingExcludes: {
    '*': [
      // GNU platform binaries - Alpine uses musl only
      'node_modules/**/*-linux-x64-gnu*/**',
      // typescript - build-time only
      'node_modules/typescript/**',
      // sharp libvips GNU variant (keep musl)
      'node_modules/@img/sharp-libvips-linux-x64/**',
      // bundle-analyzer - build-time only
      'node_modules/@next/bundle-analyzer/**',
      'node_modules/webpack-bundle-analyzer/**'
    ]
  }
};

export default nextConfig;
