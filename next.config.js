/** @type {import('next').NextConfig} */

const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'docgpt-1301319986.cos.ap-shanghai.myqcloud.com',
        port: '',
        pathname: '/**'
      }
    ]
  }
};

module.exports = nextConfig;
