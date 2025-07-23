import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX({
  mdxOptions: {
    remarkPlugins: {
      image: {
        checkImageSize: false
      }
    }
  }
});

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    unoptimized: true,
    dangerouslyAllowSVG: true,
    domains: ['oss.laf.run', 'static.ppinfra.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oss.laf.run',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static.ppinfra.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withMDX(config);
