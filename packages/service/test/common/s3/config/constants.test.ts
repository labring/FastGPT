import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';
import { MongoS3DownloadAlias } from '@fastgpt/service/common/s3/accessLink/downloadAlias/schema';

const originalEnv = {
  STORAGE_VENDOR: process.env.STORAGE_VENDOR,
  STORAGE_EXTERNAL_ENDPOINT: process.env.STORAGE_EXTERNAL_ENDPOINT,
  STORAGE_S3_CDN_ENDPOINT: process.env.STORAGE_S3_CDN_ENDPOINT,
  STORAGE_DOWNLOAD_URL_MODE: process.env.STORAGE_DOWNLOAD_URL_MODE,
  STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS: process.env.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS
};

const loadConstants = async () => {
  vi.resetModules();
  return import('@fastgpt/service/common/s3/config/constants');
};

describe('s3 storage constants', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('STORAGE_VENDOR', undefined);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', undefined);
    vi.stubEnv('STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS', undefined);
  });

  afterEach(() => {
    vi.stubEnv('STORAGE_VENDOR', originalEnv.STORAGE_VENDOR);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalEnv.STORAGE_EXTERNAL_ENDPOINT);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', originalEnv.STORAGE_S3_CDN_ENDPOINT);
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', originalEnv.STORAGE_DOWNLOAD_URL_MODE);
    vi.stubEnv(
      'STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS',
      originalEnv.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS
    );
    vi.restoreAllMocks();
  });

  it('defaults to short proxy download mode when no explicit mode is configured', async () => {
    const {
      getStorageDownloadUrlMode,
      storageDownloadRedirectTtlSeconds,
      canUseStorageDownloadRedirect,
      replaceS3UrlWithCdnEndpoint
    } = await loadConstants();

    expect(getStorageDownloadUrlMode()).toBe('short-proxy');
    expect(storageDownloadRedirectTtlSeconds).toBe(300);
    expect(canUseStorageDownloadRedirect()).toBe(false);
    expect(replaceS3UrlWithCdnEndpoint('https://s3.example.com/bucket/file.png')).toBe(
      'https://s3.example.com/bucket/file.png'
    );
  });

  it('uses the expected Multipart upload defaults', async () => {
    const {
      S3_MULTIPART_UPLOAD_THRESHOLD_BYTES,
      S3_MULTIPART_PART_SIZE_BYTES,
      S3_MULTIPART_CONCURRENCY,
      S3_MULTIPART_MAX_RETRY,
      S3_MULTIPART_SESSION_EXPIRE_HOURS
    } = await loadConstants();

    expect(S3_MULTIPART_UPLOAD_THRESHOLD_BYTES).toBe(32 * 1024 * 1024);
    expect(S3_MULTIPART_PART_SIZE_BYTES).toBe(8 * 1024 * 1024);
    expect(S3_MULTIPART_CONCURRENCY).toBe(3);
    expect(S3_MULTIPART_MAX_RETRY).toBe(3);
    expect(S3_MULTIPART_SESSION_EXPIRE_HOURS).toBe(3);
  });

  it('rewrites external URLs with the CDN endpoint', async () => {
    const {
      applyRuntimeStorageConfig,
      getStorageDownloadUrlMode,
      canUseStorageDownloadRedirect,
      replaceS3UrlWithCdnEndpoint
    } = await loadConstants();

    applyRuntimeStorageConfig({
      externalEndpoint: 'https://s3.example.com',
      cdnEndpoint: 'https://cdn.example.com/files'
    });

    expect(getStorageDownloadUrlMode()).toBe('short-proxy');
    expect(canUseStorageDownloadRedirect()).toBe(true);
    expect(
      replaceS3UrlWithCdnEndpoint(
        'https://fastgpt-private.s3.example.com/chat/app/file.png?X-Amz-Signature=abc#preview'
      )
    ).toBe('https://cdn.example.com/files/chat/app/file.png?X-Amz-Signature=abc#preview');
  });

  it('uses explicit short redirect mode from instance config and redirect ttl from env', async () => {
    vi.stubEnv('STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS', '120');

    const {
      applyRuntimeStorageConfig,
      getStorageDownloadUrlMode,
      storageDownloadRedirectTtlSeconds,
      canUseStorageDownloadRedirect
    } = await loadConstants();

    applyRuntimeStorageConfig({
      downloadMode: 'short-redirect',
      externalEndpoint: 'https://s3.example.com'
    });

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(storageDownloadRedirectTtlSeconds).toBe(120);
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('allows short redirect for storage vendors that do not use STORAGE_EXTERNAL_ENDPOINT', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'cos');

    const { applyRuntimeStorageConfig, getStorageDownloadUrlMode, canUseStorageDownloadRedirect } =
      await loadConstants();

    applyRuntimeStorageConfig({ downloadMode: 'short-redirect' });

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('allows AWS S3 redirect without an explicit external endpoint', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'aws-s3');

    const { canUseStorageDownloadRedirect } = await loadConstants();

    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('returns a short link in short redirect mode', async () => {
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://s3.example.com');
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');

    const { S3BaseBucket } = await vi.importActual<
      typeof import('@fastgpt/service/common/s3/buckets/base')
    >('@fastgpt/service/common/s3/buckets/base');
    const storage = createVitestStorageMock({
      vi,
      bucketName: 'fastgpt-private',
      baseUrl: 'https://s3.example.com'
    });
    const bucket = new S3BaseBucket(storage, undefined);

    const result = await bucket.createExternalUrl({
      key: 'chat/app/user/chat/file.png'
    });

    expect(storage.generatePresignedGetUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      bucket: 'fastgpt-private',
      key: 'chat/app/user/chat/file.png'
    });
    expect(result.url).toMatch(
      /\/api\/system\/file\/d\/[A-Za-z0-9_-]{16}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/
    );
  });

  it('stores a decoded filename in the short-link alias for encoded keys', async () => {
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://s3.example.com');
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');

    const { S3BaseBucket } = await vi.importActual<
      typeof import('@fastgpt/service/common/s3/buckets/base')
    >('@fastgpt/service/common/s3/buckets/base');
    const storage = createVitestStorageMock({
      vi,
      bucketName: 'fastgpt-private',
      baseUrl: 'https://s3.example.com'
    });
    const bucket = new S3BaseBucket(storage, undefined);
    const key = 'chat/app/user/chat/%E6%96%87%E6%A1%A3.docx';

    await bucket.createExternalUrl({ key });

    await expect(MongoS3DownloadAlias.findOne({ objectKey: key }).lean()).resolves.toMatchObject({
      filename: '文档.docx'
    });
  });

  it('returns short download links by default even when an external endpoint is configured', async () => {
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://s3.example.com');

    const { S3BaseBucket } = await vi.importActual<
      typeof import('@fastgpt/service/common/s3/buckets/base')
    >('@fastgpt/service/common/s3/buckets/base');
    const storage = createVitestStorageMock({
      vi,
      bucketName: 'fastgpt-private',
      baseUrl: 'https://s3.example.com'
    });
    const bucket = new S3BaseBucket(storage, undefined);

    const result = await bucket.createExternalUrl({
      key: 'chat/app/user/chat/file.png'
    });

    expect(storage.generatePresignedGetUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      bucket: 'fastgpt-private',
      key: 'chat/app/user/chat/file.png'
    });
    expect(result.url).toMatch(
      /\/api\/system\/file\/d\/[A-Za-z0-9_-]{16}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/
    );
  });

  it('keeps internal presigned previews for server-side storage access', async () => {
    const { S3BaseBucket } = await vi.importActual<
      typeof import('@fastgpt/service/common/s3/buckets/base')
    >('@fastgpt/service/common/s3/buckets/base');
    const storage = createVitestStorageMock({
      vi,
      bucketName: 'fastgpt-private',
      baseUrl: 'https://s3.example.com'
    });
    const bucket = new S3BaseBucket(storage, undefined);

    const result = await bucket.createPreviewUrl({
      key: 'dataset/team/aaa.md',
      responseContentType: 'text/markdown; charset=utf-8'
    });

    expect(storage.generatePresignedGetUrl).toHaveBeenCalledWith({
      key: 'dataset/team/aaa.md',
      expiredSeconds: 1800,
      responseContentType: 'text/markdown; charset=utf-8'
    });
    expect(result.url).toContain('response-content-type=text%2Fmarkdown%3B%20charset%3Dutf-8');
  });

  it('reads storage runtime values from instance config only, never from env', async () => {
    // 环境变量故意配置成会误导的值，验证运行时完全忽略它
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://env.example.com');
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.env.example.com');

    const {
      applyRuntimeStorageConfig,
      getStorageDownloadUrlMode,
      getStorageExternalEndpoint,
      getStorageS3CdnEndpoint,
      canUseStorageDownloadRedirect
    } = await loadConstants();

    // 未注入实例配置时使用 Schema 默认值，且不回落 env
    expect(getStorageDownloadUrlMode()).toBe('short-proxy');
    expect(getStorageExternalEndpoint()).toBe('');
    expect(getStorageS3CdnEndpoint()).toBe('');

    // 注入后以实例配置为准
    applyRuntimeStorageConfig({
      downloadMode: 'short-redirect',
      externalEndpoint: 'https://db.example.com',
      cdnEndpoint: 'https://cdn.db.example.com'
    });

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(getStorageExternalEndpoint()).toBe('https://db.example.com');
    expect(getStorageS3CdnEndpoint()).toBe('https://cdn.db.example.com');
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('reports whether injected storage config changed', async () => {
    const { applyRuntimeStorageConfig } = await loadConstants();

    // 首次注入不算变更（启动时 bucket 尚未构造）
    expect(applyRuntimeStorageConfig({ downloadMode: 'short-proxy' })).toBe(false);
    // 相同值重复注入不触发重建
    expect(applyRuntimeStorageConfig({ downloadMode: 'short-proxy' })).toBe(false);
    // 值变化时返回 true，供调用方重建 bucket
    expect(applyRuntimeStorageConfig({ downloadMode: 'short-redirect' })).toBe(true);
  });
});
