/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
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
