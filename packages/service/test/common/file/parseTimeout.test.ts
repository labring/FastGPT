import { beforeEach, describe, expect, it } from 'vitest';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';

const { getBackendFileOperationTimeoutMs, getPdfEnhancedParseTimeoutMs } =
  await import('@fastgpt/service/common/file/parseTimeout');

describe('getBackendFileOperationTimeoutMs', () => {
  beforeEach(() => {
    getTestInstanceConfig().performance.parse.fileTimeoutSeconds = 600;
  });

  it.each([60, 300, 600, 1200, 6000])('直接按实例配置秒数转换为毫秒: %s', (seconds) => {
    getTestInstanceConfig().performance.parse.fileTimeoutSeconds = seconds;

    expect(getBackendFileOperationTimeoutMs()).toBe(seconds * 1000);
  });
});

describe('getPdfEnhancedParseTimeoutMs', () => {
  beforeEach(() => {
    getTestInstanceConfig().performance.parse.fileTimeoutSeconds = 600;
    getTestInstanceConfig().providers.documentParse.customPdf.timeoutSeconds = 600;
  });

  it('默认 600 秒且独立于普通文件解析超时配置', () => {
    getTestInstanceConfig().performance.parse.fileTimeoutSeconds = 3600;
    expect(getPdfEnhancedParseTimeoutMs()).toBe(600000);
  });

  it.each([60, 600, 1800, 7200])('按 PDF 增强解析专用秒数转换为毫秒: %s', (seconds) => {
    getTestInstanceConfig().providers.documentParse.customPdf.timeoutSeconds = seconds;
    expect(getPdfEnhancedParseTimeoutMs()).toBe(seconds * 1000);
  });
});
