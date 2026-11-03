import { beforeEach, describe, expect, it } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

// 实例配置 performance.parse.fileTimeoutSeconds 是唯一运行时来源。
const instanceConfig = resolveSystemInstanceConfig({});
(global as any).systemInstanceConfig = instanceConfig;

const { getBackendFileOperationTimeoutMs } =
  await import('@fastgpt/service/common/file/parseTimeout');

describe('getBackendFileOperationTimeoutMs', () => {
  beforeEach(() => {
    instanceConfig.performance.parse.fileTimeoutSeconds = 600;
  });

  it('配置小于 10 分钟时保留最小后端等待时间', () => {
    instanceConfig.performance.parse.fileTimeoutSeconds = 300;

    expect(getBackendFileOperationTimeoutMs()).toBe(600000);
  });

  it.each([600, 1200, 6000])('按实例配置秒数转换为毫秒: %s', (seconds) => {
    instanceConfig.performance.parse.fileTimeoutSeconds = seconds;

    expect(getBackendFileOperationTimeoutMs()).toBe(seconds * 1000);
  });
});
