import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    PARSE_FILE_TIMEOUT_SECONDS: 600
  }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

const { getBackendFileOperationTimeoutMs } =
  await import('@fastgpt/service/common/file/parseTimeout');

describe('getBackendFileOperationTimeoutMs', () => {
  beforeEach(() => {
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 600;
  });

  it('配置小于 10 分钟时保留最小后端等待时间', () => {
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 300;

    expect(getBackendFileOperationTimeoutMs()).toBe(600000);
  });

  it.each([600, 1200, 6000])('按环境变量秒数转换为毫秒: %s', (seconds) => {
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = seconds;

    expect(getBackendFileOperationTimeoutMs()).toBe(seconds * 1000);
  });
});
