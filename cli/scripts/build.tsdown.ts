import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';

export default defineConfig({
  cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  entry: {
    run: 'src/cli/run.ts',
    cli: 'src/cli/cli.ts'
  },
  minify: true,
  clean: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: {
    alwaysBundle: [
      /^@fastgpt\/global/,
      /^zod/,
      /^commander/,
      /^@clack\/prompts/,
      /^@clack\/core/,
      /^ky/,
      /^picocolors/,
      /^sisteransi/
    ],
    onlyBundle: false
  },
  dts: false
});
