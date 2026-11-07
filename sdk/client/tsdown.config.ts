import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/client.ts',
    'src/error.ts',
    'src/type.ts',
    'src/dataset/type.ts',
    'src/dataset/operations.ts',
    'src/dataset/schema.ts'
  ],
  format: 'esm',
  platform: 'node',
  target: 'es2023',
  dts: { enabled: true, sourcemap: false },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' })
});
