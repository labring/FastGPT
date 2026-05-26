import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      ...baseConfig.test?.coverage,
      enabled: false
    },
    fileParallelism: false,
    include: ['test/**/*.benchmark.ts'],
    maxWorkers: 1,
    outputFile: 'benchmark-results.json'
  }
});
