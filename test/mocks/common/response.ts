import { vi } from 'vitest';

/**
 * Mock response functions for testing
 * 在测试中 mock HTTP 响应处理函数
 */
vi.mock('@fastgpt/service/common/response', () => ({
  jsonRes: vi.fn(),
  sseErrRes: vi.fn(),
  responseWrite: vi.fn(),
  responseWriteController: vi.fn(),
  responseWriteNodeStatus: vi.fn(),
  processError: vi.fn()
}));
