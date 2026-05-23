import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: true,
  outDir: 'dist',
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false
  }
});
