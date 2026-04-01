import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultStorageOptions } from '@fastgpt/service/common/s3/constants';
import { AwsS3StorageAdapter } from '../../../../../sdk/storage/src/adapters/aws-s3.adapter';
import { createStorage } from '../../../../../sdk/storage/src/factory';

const ENV_KEYS = [
  'STORAGE_VENDOR',
  'STORAGE_BOS_ENDPOINT',
  'STORAGE_S3_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_PUBLIC_BUCKET',
  'STORAGE_PRIVATE_BUCKET',
  'STORAGE_S3_FORCE_PATH_STYLE'
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
});

describe('createDefaultStorageOptions', () => {
  it('should build bos config from bos-specific env vars', () => {
    process.env.STORAGE_VENDOR = 'bos';
    process.env.STORAGE_BOS_ENDPOINT = 'https://s3.bj.bcebos.com';
    process.env.STORAGE_REGION = 'bj';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-ak';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-sk';

    const result = createDefaultStorageOptions();

    expect(result.vendor).toBe('bos');
    expect(result.endpoint).toBe('https://s3.bj.bcebos.com');
    expect(result.region).toBe('bj');
    expect(result.credentials).toEqual({
      accessKeyId: 'test-ak',
      secretAccessKey: 'test-sk'
    });
    expect(result.forcePathStyle).toBe(true);
  });
});

describe('createStorage', () => {
  it('should route bos to the aws s3 compatible adapter', () => {
    const storage = createStorage({
      vendor: 'bos',
      bucket: 'fastgpt-bos',
      endpoint: 'https://s3.bj.bcebos.com',
      region: 'bj',
      credentials: {
        accessKeyId: 'test-ak',
        secretAccessKey: 'test-sk'
      }
    });

    expect(storage).toBeInstanceOf(AwsS3StorageAdapter);
    expect(storage.bucketName).toBe('fastgpt-bos');
  });
});
