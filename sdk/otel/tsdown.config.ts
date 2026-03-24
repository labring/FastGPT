import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/logger-entry.ts', 'src/metrics-entry.ts', 'src/tracing-entry.ts'],
  format: 'esm',
  dts: {
    enabled: true,
    sourcemap: false
  }
});
