import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

const strongFileTokenKey = '1234567890abcdef1234567890abcdef';
const getExpiredTime = () => new Date(Date.now() + 5 * 60 * 1000);
const originalEnv = {
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  FILE_DOMAIN: process.env.FILE_DOMAIN,
  FE_DOMAIN: process.env.FE_DOMAIN,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
};

const extractTokenFromUrl = (url: string) => {
  return url.split('/').pop()?.split('?')[0] || '';
};

const loadTokenModule = async () => {
  vi.resetModules();
  vi.stubEnv('FILE_TOKEN_KEY', strongFileTokenKey);

  return import('@fastgpt/service/common/s3/security/token');
};

describe('s3 token validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.stubEnv('FILE_TOKEN_KEY', originalEnv.FILE_TOKEN_KEY);
    vi.stubEnv('FILE_DOMAIN', originalEnv.FILE_DOMAIN);
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', originalEnv.NEXT_PUBLIC_BASE_URL);
    vi.restoreAllMocks();
  });

  it('accepts legacy object key tokens that do not include a type', async () => {
    const { jwtSignS3ObjectKey, jwtVerifyS3ObjectKey } = await loadTokenModule();
    const objectKey = 'chat/appId/userId/chatId/file.txt';
    const token = extractTokenFromUrl(jwtSignS3ObjectKey(objectKey, getExpiredTime()));

    await expect(jwtVerifyS3ObjectKey(token)).resolves.toMatchObject({ objectKey });
  });

  it('rejects upload tokens when verifying legacy object key tokens', async () => {
    const { jwtSignS3UploadToken, jwtVerifyS3ObjectKey } = await loadTokenModule();
    const token = extractTokenFromUrl(
      jwtSignS3UploadToken({
        objectKey: 'chat/appId/userId/chatId/file.txt',
        bucketName: 'fastgpt-private',
        expiredTime: getExpiredTime(),
        maxSize: 1024,
        uploadConstraints: {
          defaultContentType: 'text/plain'
        }
      })
    );

    await expect(jwtVerifyS3ObjectKey(token)).rejects.toBe(ERROR_ENUM.unAuthFile);
  });

  it('rejects download tokens when verifying legacy object key tokens', async () => {
    const { jwtSignS3DownloadToken, jwtVerifyS3ObjectKey } = await loadTokenModule();
    const token = extractTokenFromUrl(
      jwtSignS3DownloadToken({
        objectKey: 'dataset/datasetId/file.txt',
        bucketName: 'fastgpt-private',
        expiredTime: getExpiredTime(),
        filename: 'file.txt'
      })
    );

    await expect(jwtVerifyS3ObjectKey(token)).rejects.toBe(ERROR_ENUM.unAuthFile);
  });

  it('normalizes endpoint slashes when signing file URLs', async () => {
    vi.stubEnv('FILE_DOMAIN', 'https://files.example.com/');
    vi.stubEnv('FE_DOMAIN', undefined);
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '/fastgpt');

    const { jwtSignS3ObjectKey } = await loadTokenModule();
    const url = jwtSignS3ObjectKey('chat/appId/userId/chatId/file.txt', getExpiredTime());

    expect(url).toMatch(/^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/[^/?#]+$/);
  });
});
