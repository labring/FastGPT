import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

const strongFileTokenKey = '1234567890abcdef1234567890abcdef';
const getExpiredTime = () => new Date(Date.now() + 5 * 60 * 1000);

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
    vi.unstubAllEnvs();
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
});
