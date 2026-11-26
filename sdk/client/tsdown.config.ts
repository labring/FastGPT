import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    errors: 'src/core/errors.ts',
    sse: 'src/core/sse.ts',
    options: 'src/core/types.ts',
    interactive: 'src/helpers/interactive.ts',
    pagination: 'src/helpers/pagination.ts',
    types: 'src/generated/types.ts'
  },
  format: ['esm', 'cjs'],
  dts: {
    enabled: true,
    sourcemap: false
  }
});
