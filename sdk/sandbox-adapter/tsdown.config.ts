import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  dts: {
    enabled: true,
    sourcemap: false
  },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' })
});
