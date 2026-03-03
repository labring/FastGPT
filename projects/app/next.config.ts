import type { NextConfig } from 'next';
import path from 'path';
import withBundleAnalyzerInit from '@next/bundle-analyzer';

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === 'true'
});

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_URL,
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-Hant'],
    localeDetection: false
  },
  output: 'standalone',
  // 开发环境关闭 strict mode，避免第三方库的双重渲染问题
  reactStrictMode: !isDev,
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

  webpack(config, { isServer }) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@scalar\/api-reference-react/,
        message: /autoprefixer/
      }
    ];

    Object.assign(config.resolve!.alias, {
      '@mongodb-js/zstd': false,
      '@aws-sdk/credential-providers': false,
      snappy: false,
      aws4: false,
      'mongodb-client-encryption': false,
      kerberos: false,
      'supports-color': false,
      'bson-ext': false,
      'pg-native': false
    });

    config.module = {
      ...config.module,
      rules: (config.module?.rules || []).concat([
        {
          test: /\.svg$/i,
          issuer: /\.[jt]sx?$/,
          use: ['@svgr/webpack']
        }
      ]),
      exprContextCritical: false,
      unknownContextCritical: false
    };

    if (!config.externals) {
      config.externals = [];
    }

    if (isServer) {
      (config.externals as string[]).push('@node-rs/jieba');
    }

    config.experiments = {
      asyncWebAssembly: true,
      layers: true
    };

    if (isDev && !isServer) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules', '**/.git', '**/dist', '**/coverage']
      };
    }

    return config;
  },
  transpilePackages: ['@modelcontextprotocol/sdk', 'ahooks'],
  serverExternalPackages: [
    'mongoose',
    'pg',
    'bullmq',
    '@zilliz/milvus2-sdk-node',
    'tiktoken',
    '@opentelemetry/api-logs'
  ],
  // 优化大库的 barrel exports tree-shaking
  experimental: {
    optimizePackageImports: [
      '@chakra-ui/react',
      '@chakra-ui/icons',
      'lodash',
      'date-fns',
      'ahooks',
      'framer-motion',
      '@emotion/react',
      '@emotion/styled'
    ],
    // 按页面拆分 CSS chunk，减少首屏 CSS 体积
    cssChunking: 'strict'
  },
  outputFileTracingRoot: path.join(__dirname, '../../')
};

export default withBundleAnalyzer(nextConfig);
