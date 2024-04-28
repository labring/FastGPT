/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');
const path = require('path');

const nextConfig = {
  i18n,
  output: 'standalone',
  reactStrictMode: process.env.NODE_ENV === 'development' ? false : true,
  compress: true,
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
        },
        {
          test: /\.node$/,
          use: [{ loader: 'nextjs-node-loader' }]
        }
      ]),
      exprContextCritical: false,
      unknownContextCritical: false
    };

    if (isServer) {
      config.externals.push('worker_threads');

      if (nextRuntime === 'nodejs') {
        // config.output.globalObject = 'self';

        const oldEntry = config.entry;
        config = {
          ...config,
          async entry(...args) {
            const entries = await oldEntry(...args);
            return {
              ...entries,
              'worker/htmlStr2Md': path.resolve(
                process.cwd(),
                '../../packages/service/worker/htmlStr2Md.ts'
              ),
              'worker/countGptMessagesTokens': path.resolve(
                process.cwd(),
                '../../packages/service/worker/tiktoken/countGptMessagesTokens.ts'
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
      if (!config.externals) {
        config.externals = [];
      }
    }

    return config;
  },
  transpilePackages: ['@fastgpt/*', 'ahooks'],
  experimental: {
    // 外部包独立打包
    serverComponentsExternalPackages: ['mongoose', 'pg'],
    // 指定导出包优化，按需引入包模块
    optimizePackageImports: ['mongoose', 'pg'],
    outputFileTracingRoot: path.join(__dirname, '../../')
  }
};

module.exports = nextConfig;
