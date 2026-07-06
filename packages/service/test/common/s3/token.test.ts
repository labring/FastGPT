import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import jwt from 'jsonwebtoken';

const strongFileTokenKey = '1234567890abcdef1234567890abcdef';
const originalEnv = {
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  FILE_DOMAIN: process.env.FILE_DOMAIN,
  FE_DOMAIN: process.env.FE_DOMAIN,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
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

  it('rejects upload tokens when verifying download tokens', async () => {
    const { jwtVerifyS3DownloadToken } = await loadTokenModule();
    const token = jwt.sign(
      {
        objectKey: 'chat/appId/userId/chatId/file.txt',
        bucketName: 'fastgpt-private',
        maxSize: 1024,
        uploadConstraints: {
          defaultContentType: 'text/plain'
        },
        type: 'upload'
      },
      strongFileTokenKey,
      { expiresIn: 300 }
    );

    await expect(jwtVerifyS3DownloadToken(token)).rejects.toBe(ERROR_ENUM.unAuthFile);
  });

  it('rejects download tokens when verifying upload tokens', async () => {
    const { jwtVerifyS3UploadToken } = await loadTokenModule();
    const token = jwt.sign(
      {
        objectKey: 'dataset/datasetId/file.txt',
        bucketName: 'fastgpt-private',
        type: 'download'
      },
      strongFileTokenKey,
      { expiresIn: 300 }
    );

    await expect(jwtVerifyS3UploadToken(token)).rejects.toBe(ERROR_ENUM.unAuthFile);
  });

  it('does not expose legacy JWT signing helpers', async () => {
    const tokenModule = await loadTokenModule();

    expect('jwtSignS3DownloadToken' in tokenModule).toBe(false);
    expect('jwtSignS3UploadToken' in tokenModule).toBe(false);
  });
});
