import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node20',
  deps: {
    alwaysBundle: [/^@fastgpt\/workflow-core/, /^@fastgpt\/global/, /^@fastgpt\/web/],
    onlyBundle: false
  },
  dts: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' })
});
