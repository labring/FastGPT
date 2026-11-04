import {
  getTestInstanceConfig,
  createDefaultInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
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
    global.systemInstanceConfig = createDefaultInstanceConfig();
    vi.stubEnv('STORAGE_VENDOR', undefined);
    getTestInstanceConfig().storage.externalEndpoint =
      createDefaultInstanceConfig().storage.externalEndpoint;
    getTestInstanceConfig().storage.cdnEndpoint = createDefaultInstanceConfig().storage.cdnEndpoint;
    getTestInstanceConfig().storage.downloadMode =
      createDefaultInstanceConfig().storage.downloadMode;
    getTestInstanceConfig().storage.redirectTtlSeconds =
      createDefaultInstanceConfig().storage.redirectTtlSeconds;
  });

  afterEach(() => {
    vi.stubEnv('STORAGE_VENDOR', originalEnv.STORAGE_VENDOR);
    getTestInstanceConfig().storage.externalEndpoint =
      originalEnv.STORAGE_EXTERNAL_ENDPOINT ??
      createDefaultInstanceConfig().storage.externalEndpoint;
    getTestInstanceConfig().storage.cdnEndpoint =
      originalEnv.STORAGE_S3_CDN_ENDPOINT ?? createDefaultInstanceConfig().storage.cdnEndpoint;
    getTestInstanceConfig().storage.downloadMode =
      originalEnv.STORAGE_DOWNLOAD_URL_MODE ?? createDefaultInstanceConfig().storage.downloadMode;
    getTestInstanceConfig().storage.redirectTtlSeconds =
      originalEnv.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS === undefined
        ? createDefaultInstanceConfig().storage.redirectTtlSeconds
        : Number(originalEnv.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS);
    vi.restoreAllMocks();
  });

  it('defaults to short proxy download mode when no explicit mode is configured', async () => {
    const {
      getStorageDownloadUrlMode,
      getStorageRedirectTtlSeconds,
      canUseStorageDownloadRedirect,
      replaceS3UrlWithCdnEndpoint
    } = await loadConstants();

    expect(getStorageDownloadUrlMode()).toBe('short-proxy');
    expect(getStorageRedirectTtlSeconds()).toBe(300);
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
      getStorageDownloadUrlMode,
      canUseStorageDownloadRedirect,
      replaceS3UrlWithCdnEndpoint
    } = await loadConstants();

    getTestInstanceConfig().storage.externalEndpoint = 'https://s3.example.com';
    getTestInstanceConfig().storage.cdnEndpoint = 'https://cdn.example.com/files';

    expect(getStorageDownloadUrlMode()).toBe('short-proxy');
    expect(canUseStorageDownloadRedirect()).toBe(true);
    expect(
      replaceS3UrlWithCdnEndpoint(
        'https://fastgpt-private.s3.example.com/chat/app/file.png?X-Amz-Signature=abc#preview'
      )
    ).toBe('https://cdn.example.com/files/chat/app/file.png?X-Amz-Signature=abc#preview');
  });

  it('reads explicit short redirect mode and TTL from instance config', async () => {
    getTestInstanceConfig().storage.redirectTtlSeconds = 120;

    const {
      getStorageDownloadUrlMode,
      getStorageRedirectTtlSeconds,
      canUseStorageDownloadRedirect
    } = await loadConstants();

    getTestInstanceConfig().storage.downloadMode = 'short-redirect';
    getTestInstanceConfig().storage.externalEndpoint = 'https://s3.example.com';

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(getStorageRedirectTtlSeconds()).toBe(120);
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('allows short redirect for storage vendors that do not use STORAGE_EXTERNAL_ENDPOINT', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'cos');

    const { getStorageDownloadUrlMode, canUseStorageDownloadRedirect } = await loadConstants();

    getTestInstanceConfig().storage.downloadMode = 'short-redirect';

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('reads the download policy from the canonical snapshot without an init injection', async () => {
    // 路由 bundle 不会执行启动期的 applyRuntimeStorageConfig，必须仍能读到库里的策略
    getTestInstanceConfig().storage.downloadMode = 'short-redirect';
    getTestInstanceConfig().storage.externalEndpoint = 'https://s3.example.com';

    const {
      getStorageDownloadUrlMode,
      getStorageExternalEndpoint,
      getStorageS3CdnEndpoint,
      canUseStorageDownloadRedirect
    } = await loadConstants();

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(getStorageExternalEndpoint()).toBe('https://s3.example.com');
    expect(getStorageS3CdnEndpoint()).toBe(createDefaultInstanceConfig().storage.cdnEndpoint);
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('allows AWS S3 redirect without an explicit external endpoint', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'aws-s3');

    const { canUseStorageDownloadRedirect } = await loadConstants();

    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('returns a short link in short redirect mode', async () => {
    getTestInstanceConfig().storage.externalEndpoint =
      'https://s3.example.com' ?? createDefaultInstanceConfig().storage.externalEndpoint;
    getTestInstanceConfig().storage.downloadMode =
      'short-redirect' ?? createDefaultInstanceConfig().storage.downloadMode;

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
    getTestInstanceConfig().storage.externalEndpoint =
      'https://s3.example.com' ?? createDefaultInstanceConfig().storage.externalEndpoint;
    getTestInstanceConfig().storage.downloadMode =
      'short-redirect' ?? createDefaultInstanceConfig().storage.downloadMode;

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
    getTestInstanceConfig().storage.externalEndpoint =
      'https://s3.example.com' ?? createDefaultInstanceConfig().storage.externalEndpoint;

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
    // env 故意配成误导值；运行时只认 canonical 快照，路由 bundle 不执行启动注入
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://env.example.com');
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.env.example.com');

    const {
      getStorageDownloadUrlMode,
      getStorageExternalEndpoint,
      getStorageS3CdnEndpoint,
      canUseStorageDownloadRedirect
    } = await loadConstants();

    // 快照为默认：返回默认值，不回落 env
    expect(getStorageDownloadUrlMode()).toBe('short-proxy');
    expect(getStorageExternalEndpoint()).toBe('');
    expect(getStorageS3CdnEndpoint()).toBe('');

    // 快照有值：以快照为准（等价于管理员保存后，任意路由按请求期读取）
    getTestInstanceConfig().storage.downloadMode = 'short-redirect';
    getTestInstanceConfig().storage.externalEndpoint = 'https://db.example.com';
    getTestInstanceConfig().storage.cdnEndpoint = 'https://cdn.db.example.com';

    expect(getStorageDownloadUrlMode()).toBe('short-redirect');
    expect(getStorageExternalEndpoint()).toBe('https://db.example.com');
    expect(getStorageS3CdnEndpoint()).toBe('https://cdn.db.example.com');
    expect(canUseStorageDownloadRedirect()).toBe(true);
  });

  it('prefers instance config redirectTtlSeconds over env when snapshot carries the value', async () => {
    // 迁移回填/管理员保存后快照叶子存在，getter 以实例配置为权威，不再读 env 初值
    (global as any).systemInstanceConfig = {
      ...((global as any).systemInstanceConfig ?? {}),
      storage: { redirectTtlSeconds: 60 }
    };
    vi.stubEnv('STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS', '120');

    const { getStorageRedirectTtlSeconds } = await loadConstants();
    expect(getStorageRedirectTtlSeconds()).toBe(60);
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
