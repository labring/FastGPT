const { i18n } = require('./next-i18next.config');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n,
  output: 'standalone',
  reactStrictMode: isDev ? false : true,
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

    if (!config.externals) {
      config.externals = [];
    }

    if (isServer) {
      // config.externals.push('@zilliz/milvus2-sdk-node');

      if (nextRuntime === 'nodejs') {
        const oldEntry = config.entry;
        config = {
          ...config,
          async entry(...args) {
            const entries = await oldEntry(...args);
            return {
              ...entries,
              'worker/htmlStr2Md': path.resolve(
                process.cwd(),
                '../../packages/service/worker/htmlStr2Md/index.ts'
              ),
              'worker/countGptMessagesTokens': path.resolve(
                process.cwd(),
                '../../packages/service/worker/tiktoken/countGptMessagesTokens.ts'
              ),
              'worker/readFile': path.resolve(
                process.cwd(),
                '../../packages/service/worker/file/read.ts'
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
  transpilePackages: ['@fastgpt/*', 'ahooks'],
  experimental: {
    // 优化 Server Components 的构建和运行，避免不必要的客户端打包。
    serverComponentsExternalPackages: [
      'mongoose',
      'pg',
      '@node-rs/jieba',
      '@zilliz/milvus2-sdk-node'
    ],
    outputFileTracingRoot: path.join(__dirname, '../../')
  }
};

module.exports = nextConfig;
