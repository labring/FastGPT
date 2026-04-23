const { i18n } = require('./next-i18next.config.js');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const monorepoRoot = path.join(__dirname, '../../');
const emptyModulePath = './packages/service/common/system/emptyModule.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_URL,
  i18n,
  output: 'standalone',
  reactStrictMode: isDev ? false : true,
  compress: true,
  // 禁用 source map（可选，根据需要）
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/((?!chat/share$).*)',
        headers: [
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
        ]
      }
    ];
  },
  turbopack: {
    root: monorepoRoot,
    resolveAlias: {
      '@mongodb-js/zstd': emptyModulePath,
      '@aws-sdk/credential-providers': emptyModulePath,
      snappy: emptyModulePath,
      aws4: emptyModulePath,
      'mongodb-client-encryption': emptyModulePath,
      kerberos: emptyModulePath,
      'supports-color': emptyModulePath,
      'bson-ext': emptyModulePath,
      'pg-native': emptyModulePath,
      fs: {
        browser: emptyModulePath
      }
    },
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js'
      }
    }
  },
  // 需要转译的包
  transpilePackages: ['@modelcontextprotocol/sdk', 'ahooks'],
  serverExternalPackages: [
    '@node-rs/jieba',
    'mongoose',
    'pg',
    'bullmq',
    '@zilliz/milvus2-sdk-node',
    'tiktoken',
    '@opentelemetry/api-logs'
  ],
  experimental: {
    workerThreads: true
  },
  outputFileTracingRoot: monorepoRoot
};

module.exports = nextConfig;
