import type { NextConfig } from 'next';
import path from 'path';
import withBundleAnalyzerInit from '@next/bundle-analyzer';
import withRspack from 'next-rspack';

const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === 'true' });

const isDev = process.env.NODE_ENV === 'development';
const isWebpack = process.env.WEBPACK === '1';
const isRspack = isDev && !isWebpack;

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_URL,
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-Hant'],
    localeDetection: false
  },
  output: 'standalone',
  // 关闭 strict mode，避免第三方库的双重渲染问题
  reactStrictMode: !isDev,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/((?!chat\\/share$)(?!proxy\\/)(?!absproxy\\/).*)',
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
      },
      {
        module: /any-promise[\\/]register\.js$/,
        message: /Critical dependency: the request of a dependency is an expression/
      },
      {
        module: /bullmq[\\/]dist[\\/](cjs|esm)[\\/]classes[\\/]child-processor\.js$/,
        message: /Critical dependency: the request of a dependency is an expression/
      },
      {
        module: /@fastgpt-sdk[\\/]sandbox-adapter[\\/]/,
        message: /Critical dependency/
      }
    ];

    Object.assign(config.resolve!.alias, {
      '@mongodb-js/zstd': false,
      '@aws-sdk/credential-providers': false,
      'gcp-metadata': false,
      snappy: false,
      aws4: false,
      'mongodb-client-encryption': false,
      kerberos: false,
      'supports-color': false,
      'bson-ext': false,
      'pg-native': false,
      ...(isDev &&
        (() => {
          // In dev, fastgpt-pro + FastGPT nested pnpm workspaces create two separate .pnpm stores,
          // causing duplicate module instances (React, Lexical, etc.) and runtime errors like
          // "Cannot read properties of null (reading 'useContext')" or
          // "Unable to find an active editor state".
          // Force all shared packages to resolve from this project's node_modules.
          const resolve = (pkg: string) => {
            try {
              return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [__dirname] }));
            } catch {
              return undefined;
            }
          };
          const dups = [
            'react',
            'react-dom',
            'lexical',
            '@lexical/react',
            '@lexical/code',
            '@lexical/list',
            '@lexical/markdown',
            '@lexical/rich-text',
            '@lexical/selection',
            '@lexical/text',
            '@lexical/utils',
            '@chakra-ui/react',
            '@chakra-ui/system',
            '@emotion/react',
            '@emotion/styled',
            'use-context-selector'
          ];
          return Object.fromEntries(dups.map((pkg) => [pkg, resolve(pkg)]).filter(([, v]) => v));
        })())
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
      // 这些包只在服务端运行，且内部使用动态 import / 原生可选依赖（ws 的 bufferutil、
      // utf-8-validate，pi-ai 的 node:os/provider dynamicImport 等），让 webpack 直接
      // externalize，避免扫描源码产生 Critical dependency / Module not found 警告。
      config.externals.push({
        '@node-rs/jieba': '@node-rs/jieba',
        '@mariozechner/pi-ai': 'commonjs @mariozechner/pi-ai',
        '@mariozechner/pi-agent-core': 'commonjs @mariozechner/pi-agent-core',
        '@google/genai': 'commonjs @google/genai',
        ws: 'commonjs ws',
        bufferutil: 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate'
      });
    }

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true
    };

    if (isDev && !isServer) {
      config.devtool = 'cheap-module-source-map';

      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules',
          '**/.git',
          '**/dist',
          '**/coverage',
          '../../packages/**/node_modules',
          '../../packages/**/dist',
          '**/.next',
          '**/out'
        ],
        // 减少轮询频率，降低 CPU 和内存占用
        poll: 1000,
        aggregateTimeout: 300
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
    '@opentelemetry/api-logs',
    '@mariozechner/pi-agent-core',
    '@mariozechner/pi-ai'
  ],
  // 优化大库的 barrel exports tree-shaking
  experimental: {
    optimizePackageImports: [
      '@chakra-ui/react',
      '@chakra-ui/icons',
      'lodash',
      'ahooks',
      'framer-motion',
      '@emotion/react',
      '@emotion/styled',
      'react-syntax-highlighter',
      'recharts',
      '@tanstack/react-query',
      'react-hook-form',
      'react-markdown'
    ],
    // 按页面拆分 CSS chunk，减少首屏 CSS 体积
    cssChunking: 'strict',
    // 减少内存占用
    memoryBasedWorkersCount: true
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Exclude build-time-only packages from standalone output file tracing
  outputFileTracingExcludes: {
    '*': [
      // Rspack bindings - only used in dev, not needed at runtime
      'node_modules/@next/rspack-binding-*/**',
      'node_modules/@rspack/binding-*/**',
      'node_modules/next-rspack/**',
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

const config = withBundleAnalyzer(nextConfig);
export default isRspack ? withRspack(config) : config;
