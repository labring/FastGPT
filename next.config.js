/** @type {import('next').NextConfig} */

const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  compress: true
};

module.exports = nextConfig;
