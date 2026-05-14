import { defineConfig } from 'tsdown';

const bundledDeps = [
  /^@fastgpt-sdk\/otel(\/.*)?$/,
  /^@fastgpt\/global(\/.*)?$/,
  'cookie',
  'dotenv',
  'http-proxy',
  'jsonwebtoken',
  'lru-cache',
  'zod'
];

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: true,
  outDir: 'dist',
  deps: {
    alwaysBundle: bundledDeps
  }
});
