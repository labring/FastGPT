import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server/index.ts',
    errors: 'src/core/errors.ts'
  },
  format: ['esm', 'cjs'],
  dts: {
    enabled: true,
    sourcemap: false
  }
});
