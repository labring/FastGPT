import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';

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
      storageDownloadUrlMode,
      storageDownloadRedirectTtlSeconds,
      canUseStorageDownloadRedirect,
      replaceS3UrlWithCdnEndpoint
    } = await loadConstants();

    expect(storageDownloadUrlMode).toBe('short-proxy');
    expect(storageDownloadRedirectTtlSeconds).toBe(300);
    expect(canUseStorageDownloadRedirect).toBe(false);
    expect(replaceS3UrlWithCdnEndpoint('https://s3.example.com/bucket/file.png')).toBe(
      'https://s3.example.com/bucket/file.png'
    );
  });

  it('keeps short proxy download mode but enables redirect when CDN endpoint is configured', async () => {
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.example.com/files');

    const { storageDownloadUrlMode, canUseStorageDownloadRedirect, replaceS3UrlWithCdnEndpoint } =
      await loadConstants();

    expect(storageDownloadUrlMode).toBe('short-proxy');
    expect(canUseStorageDownloadRedirect).toBe(true);
    expect(
      replaceS3UrlWithCdnEndpoint(
        'https://fastgpt-private.s3.example.com/chat/app/file.png?X-Amz-Signature=abc#preview'
      )
    ).toBe('https://cdn.example.com/files/chat/app/file.png?X-Amz-Signature=abc#preview');
  });

  it('uses explicit short redirect mode and redirect ttl from env', async () => {
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://s3.example.com');
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');
    vi.stubEnv('STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS', '120');

    const {
      storageDownloadUrlMode,
      storageDownloadRedirectTtlSeconds,
      canUseStorageDownloadRedirect
    } = await loadConstants();

    expect(storageDownloadUrlMode).toBe('short-redirect');
    expect(storageDownloadRedirectTtlSeconds).toBe(120);
    expect(canUseStorageDownloadRedirect).toBe(true);
  });

  it('allows short redirect for storage vendors that do not use STORAGE_EXTERNAL_ENDPOINT', async () => {
    vi.stubEnv('STORAGE_VENDOR', 'cos');
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');

    const { storageDownloadUrlMode, canUseStorageDownloadRedirect } = await loadConstants();

    expect(storageDownloadUrlMode).toBe('short-redirect');
    expect(canUseStorageDownloadRedirect).toBe(true);
  });

  it('rewrites external presigned URLs from S3BaseBucket', async () => {
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.example.com');

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
      key: 'chat/app/user/chat/file.png',
      mode: 'presigned'
    });

    expect(storage.generatePresignedGetUrl).toHaveBeenCalledWith({
      key: 'chat/app/user/chat/file.png',
      expiredSeconds: 1800
    });
    expect(result.url).toBe(
      'https://cdn.example.com/get/fastgpt-private/chat%2Fapp%2Fuser%2Fchat%2Ffile.png'
    );
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

  it('passes response content type overrides into external presigned URLs', async () => {
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
      key: 'dataset/team/aaa.md',
      mode: 'presigned',
      responseContentType: 'text/markdown; charset=utf-8'
    });

    expect(storage.generatePresignedGetUrl).toHaveBeenCalledWith({
      key: 'dataset/team/aaa.md',
      expiredSeconds: 1800,
      responseContentType: 'text/markdown; charset=utf-8'
    });
    expect(result.url).toContain('response-content-type=text%2Fmarkdown%3B%20charset%3Dutf-8');
  });
});
