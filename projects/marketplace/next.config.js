const { i18n } = require('./next-i18next.config.js');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_URL,
  i18n,
  output: 'standalone',
  reactStrictMode: isDev ? false : true,
  compress: true,
  // 禁用 source map（可选，根据需要）
  productionBrowserSourceMaps: false,
  // 优化编译性能
  swcMinify: true, // 使用 SWC 压缩（生产环境已默认）
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

  webpack(config, { isServer, nextRuntime }) {
    Object.assign(config.resolve.alias, {
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
      rules: config.module.rules.concat([
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
      config.externals.push('@node-rs/jieba');

      if (nextRuntime === 'nodejs') {
      }
    } else {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve.fallback,
          fs: false
        }
      };
    }

    config.experiments = {
      asyncWebAssembly: true,
      layers: true
    };

    if (isDev && !isServer) {
      // 使用更快的 source map
      config.devtool = 'eval-cheap-module-source-map';
      // 减少文件监听范围
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules', '**/.git', '**/dist', '**/coverage']
      };
      // 启用持久化缓存
      config.cache = {
        type: 'filesystem',
        name: 'client',
        buildDependencies: {
          config: [__filename]
        },
        cacheDirectory: path.resolve(__dirname, '.next/cache/webpack'),
        maxMemoryGenerations: isDev ? 5 : Infinity,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 天
      };
    }

    return config;
  },
  // 需要转译的包
  transpilePackages: ['@modelcontextprotocol/sdk', 'ahooks'],
  experimental: {
    // 优化 Server Components 的构建和运行，避免不必要的客户端打包。
    serverComponentsExternalPackages: [
      'mongoose',
      'pg',
      'bullmq',
      '@zilliz/milvus2-sdk-node',
      'tiktoken',
      '@opentelemetry/api-logs'
    ],
    outputFileTracingRoot: path.join(__dirname, '../../'),
    instrumentationHook: true,
    workerThreads: true
  }
};

module.exports = nextConfig;
