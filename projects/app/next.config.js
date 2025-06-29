const { i18n } = require('./next-i18next.config.js');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_URL,
  i18n,
  output: 'standalone',
  reactStrictMode: isDev ? false : true,
  compress: true,
  async rewrites() {
    return [
      {
        source: '/imgs/tools/:path*',
        destination: '/api/system/pluginImgs/:path*'
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
        const oldEntry = config.entry;
        config = {
          ...config,
          async entry(...args) {
            const entries = await oldEntry(...args);
            return {
              ...entries,
              ...getWorkerConfig()
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
