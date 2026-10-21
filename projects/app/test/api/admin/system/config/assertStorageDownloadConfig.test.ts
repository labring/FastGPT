import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalVendor = process.env.STORAGE_VENDOR;
const originalExternalEndpoint = process.env.STORAGE_EXTERNAL_ENDPOINT;

/**
 * serviceEnv 在模块加载期解析环境变量，因此必须在 stubEnv 之后动态导入被测模块，
 * 否则测试读取到的是真实部署（或默认）的 vendor，而不是用例设定的值。
 */
const loadAssert = async () => {
  vi.resetModules();
  return import('@/service/common/system/assertStorageDownloadConfig');
};

describe('assertStorageDownloadConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.stubEnv('STORAGE_VENDOR', originalVendor);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalExternalEndpoint);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects MinIO short-redirect without an external endpoint', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'minio');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', '');
    const { assertStorageDownloadConfig } = await loadAssert();

    expect(() =>
      assertStorageDownloadConfig({ downloadMode: 'short-redirect', externalEndpoint: '' })
    ).toThrow();
  });

  it('accepts MinIO short-redirect when the override provides an external endpoint', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'minio');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', '');
    const { assertStorageDownloadConfig } = await loadAssert();

    expect(() =>
      assertStorageDownloadConfig({
        downloadMode: 'short-redirect',
        externalEndpoint: 'https://files.example.com'
      })
    ).not.toThrow();
  });

  it('rejects MinIO short-redirect even when env provides an external endpoint', async () => {
    // 实例配置是唯一权威来源；环境变量不参与校验，避免界面留空也能保存
    vi.stubEnv('STORAGE_VENDOR', 'minio');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://env-files.example.com');
    const { assertStorageDownloadConfig } = await loadAssert();

    expect(() =>
      assertStorageDownloadConfig({ downloadMode: 'short-redirect', externalEndpoint: '' })
    ).toThrow();
  });

  it('skips validation for short-proxy regardless of endpoint', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'minio');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', '');
    const { assertStorageDownloadConfig } = await loadAssert();

    expect(() => assertStorageDownloadConfig({ downloadMode: 'short-proxy' })).not.toThrow();
  });

  it('skips validation for vendors that provide a public endpoint', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'cos');
    const { assertStorageDownloadConfig } = await loadAssert();

    expect(() => assertStorageDownloadConfig({ downloadMode: 'short-redirect' })).not.toThrow();
  });
});
