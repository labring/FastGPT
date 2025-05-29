const { i18n } = require('./next-i18next.config.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_URL,
  i18n,
  output: 'standalone',
  reactStrictMode: isDev ? false : true,
  compress: true,

  headers: async () => {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const csp_nonce = `'nonce-${nonce}'`;
    const scheme_source = 'data: mediastream: blob: filesystem:';

    const SENTRY_DOMAINS = '*.sentry.io';
    const GOOGLE_DOMAINS = 'https://www.googletagmanager.com https://www.google-analytics.com';
    const LOCALHOST = 'http://localhost:* http://127.0.0.1:*';
    const OTHER_DOMAINS = 'https://api.example.com';

    const csp = [
      `default-src 'self' ${scheme_source} ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST}`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${csp_nonce} ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST}`,
      `style-src 'self' 'unsafe-inline' ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST}`,
      `img-src  data: blob: ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST} *`,
      `connect-src 'self' wss: https: ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST}`,
      `font-src 'self'`,
      `media-src 'self' ${scheme_source} ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST}`,
      `worker-src 'self' ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS} ${LOCALHOST} ${scheme_source}`,
      `object-src 'none'`,
      `form-action 'self'`,
      `base-uri 'self'`,
      `frame-src 'self' ${SENTRY_DOMAINS} ${GOOGLE_DOMAINS} ${OTHER_DOMAINS}`,
      `sandbox allow-scripts allow-same-origin allow-popups allow-forms`,
      `upgrade-insecure-requests`
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          { key: 'Content-Security-Policy', value: csp }
        ]
      }
    ];
  },

  webpack: (config, { isServer, nextRuntime }) => {
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
        const oldEntry = config.entry;
        config = {
          ...config,
          async entry(...args) {
            const entries = await oldEntry(...args);
            return {
              ...entries,
              ...getWorkerConfig(),
              'worker/systemPluginRun': path.resolve(
                process.cwd(),
                '../../packages/plugins/runtime/worker.ts'
              )
            };
          }
        };
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
      'tiktoken'
    ],
    outputFileTracingRoot: path.join(__dirname, '../../'),
    instrumentationHook: true
  }
};

module.exports = nextConfig;

function getWorkerConfig() {
  const result = fs.readdirSync(path.resolve(__dirname, '../../packages/service/worker'));

  // 获取所有的目录名
  const folderList = result.filter((item) => {
    return fs
      .statSync(path.resolve(__dirname, '../../packages/service/worker', item))
      .isDirectory();
  });

  const workerConfig = folderList.reduce((acc, item) => {
    acc[`worker/${item}`] = path.resolve(
      process.cwd(),
      `../../packages/service/worker/${item}/index.ts`
    );
    return acc;
  }, {});
  return workerConfig;
}
