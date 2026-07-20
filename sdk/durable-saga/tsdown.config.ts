import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: {
    enabled: true,
    sourcemap: false
  }
});
