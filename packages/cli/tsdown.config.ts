import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts', 'src/run.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  deps: { alwaysBundle: [/^@fastgpt-sdk\/client/, /^ajv/], onlyBundle: false },
  dts: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' })
});
