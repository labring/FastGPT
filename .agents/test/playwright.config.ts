import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 每次执行隔离产物，避免覆盖上一次失败证据或把报告写入仓库。
const runDirectory =
  process.env.FASTGPT_TEST_RUN_DIR ?? mkdtempSync(path.join(tmpdir(), 'fastgpt-browser-'));

export default defineConfig({
  testDir: path.resolve(process.cwd(), '.agents/test'),
  testMatch: '**/*.browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(runDirectory, 'browser-artifacts'),
  reporter: [['line'], ['json', { outputFile: path.join(runDirectory, 'playwright.json') }]],
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: process.env.FASTGPT_TEST_BASE_URL,
    storageState: process.env.FASTGPT_TEST_STORAGE_STATE,
    viewport: { width: 1600, height: 1000 },
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
