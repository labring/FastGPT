/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  compress: true,

  webpack(config) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true
    };
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
