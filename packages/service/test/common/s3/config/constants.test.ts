import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';

const originalEnv = {
  STORAGE_EXTERNAL_ENDPOINT: process.env.STORAGE_EXTERNAL_ENDPOINT,
  STORAGE_S3_CDN_ENDPOINT: process.env.STORAGE_S3_CDN_ENDPOINT
};

const loadConstants = async () => {
  vi.resetModules();
  return import('@fastgpt/service/common/s3/config/constants');
};

describe('s3 storage constants', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', undefined);
  });

  afterEach(() => {
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalEnv.STORAGE_EXTERNAL_ENDPOINT);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', originalEnv.STORAGE_S3_CDN_ENDPOINT);
    vi.restoreAllMocks();
  });

  it('keeps proxy download mode when no external or CDN endpoint is configured', async () => {
    const { storageDownloadMode, replaceS3UrlWithCdnEndpoint } = await loadConstants();

    expect(storageDownloadMode).toBe('proxy');
    expect(replaceS3UrlWithCdnEndpoint('https://s3.example.com/bucket/file.png')).toBe(
      'https://s3.example.com/bucket/file.png'
    );
  });

  it('keeps proxy download mode but rewrites S3 URLs when CDN endpoint is configured', async () => {
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.example.com/files');

    const { storageDownloadMode, replaceS3UrlWithCdnEndpoint } = await loadConstants();

    expect(storageDownloadMode).toBe('proxy');
    expect(
      replaceS3UrlWithCdnEndpoint(
        'https://fastgpt-private.s3.example.com/chat/app/file.png?X-Amz-Signature=abc#preview'
      )
    ).toBe('https://cdn.example.com/files/chat/app/file.png?X-Amz-Signature=abc#preview');
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
