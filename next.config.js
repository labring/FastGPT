/** @type {import('next').NextConfig} */

const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  compress: true,
  webpack(config) {
    config.module.rules = config.module.rules.concat([
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        use: ['@svgr/webpack']
      }
    ]);

    return config;
  }
};

module.exports = nextConfig;
