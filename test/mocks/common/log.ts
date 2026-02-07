import { vi } from 'vitest';

/**
 * Mock addLog for testing
 * 在测试中 mock 日志系统，避免测试输出中混入大量日志信息
 */
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  EventTypeEnum: {
    outLinkBot: '[Outlink bot]',
    feishuBot: '[Feishu bot]',
    wxOffiaccount: '[Offiaccount bot]'
  }
}));
