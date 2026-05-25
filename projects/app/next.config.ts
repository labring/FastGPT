import type { NextConfig } from 'next';
import path from 'path';

import { webEnv } from '@fastgpt/web/env';
import { appEnv } from './src/env';

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

const optimizedPackageImports = [
  '@chakra-ui/react',
  '@chakra-ui/icons',
  'lodash',
  'framer-motion',
  '@emotion/react',
  '@emotion/styled'
];

const nextConfig: NextConfig = {
  basePath: webEnv.NEXT_PUBLIC_BASE_URL || undefined,
  env: {
    SYSTEM_NAME: appEnv.SYSTEM_NAME,
    SYSTEM_DESCRIPTION: appEnv.SYSTEM_DESCRIPTION,
    SYSTEM_FAVICON: appEnv.SYSTEM_FAVICON
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-Hant'],
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
  transpilePackages: ['@modelcontextprotocol/sdk', 'ahooks'],
  serverExternalPackages: [
    '@node-rs/jieba',
    'bullmq',
    '@zilliz/milvus2-sdk-node',
    '@opentelemetry/api-logs',
    '@mariozechner/pi-agent-core',
    '@mariozechner/pi-ai'
  ],
  // 优化大库的 barrel exports tree-shaking
  experimental: {
    optimizePackageImports: optimizedPackageImports,
    // 按页面拆分 CSS chunk，减少首屏 CSS 体积
    cssChunking: 'strict',
    // 减少内存占用
    memoryBasedWorkersCount: true,

    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
