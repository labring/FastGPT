import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { i18n } = require('./next-i18next.config.js');
/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n,
  reactStrictMode: true,
  compress: true,
  swcMinify: true,

  webpack(config, { isServer, nextRuntime }) {
    // 配置 alias 以减少包大小
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

    // 配置模块规则
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

    // 处理 externals
    if (!config.externals) {
      config.externals = [];
    }

    if (isServer) {
      config.externals.push('@node-rs/jieba');

      if (nextRuntime === 'nodejs') {
        // Node.js runtime specific config
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

    // 启用实验性功能
    config.experiments = {
      asyncWebAssembly: true,
      layers: true
    };

    // 开发环境优化
    if (process.env.NODE_ENV === 'development' && !isServer) {
      config.devtool = 'eval-cheap-module-source-map';
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules', '**/.git', '**/dist', '**/coverage']
      };
    }

    return config;
  },

  // 需要转译的包，确保 ES Modules 能被正确处理
  transpilePackages: ['@fastgpt/service', '@fastgpt/global', '@fastgpt/web'],

  experimental: {
    serverComponentsExternalPackages: [
      'mongoose',
      'pg',
      'bullmq',
      '@zilliz/milvus2-sdk-node',
      'tiktoken',
      '@opentelemetry/api-logs'
    ],
    outputFileTracingRoot: path.join('../../')
  }
};

export default nextConfig;
