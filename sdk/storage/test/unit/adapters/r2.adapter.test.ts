import { describe, expect, it } from 'vitest';
import { R2StorageAdapter } from '../../../src/adapters/r2.adapter';

const createOptions = () => ({
  vendor: 'r2' as const,
  bucket: 'fastgpt-public',
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key'
  }
});

describe('R2StorageAdapter.constructor', () => {
  it('accepts an R2 vendor', () => {
    expect(new R2StorageAdapter(createOptions())).toBeInstanceOf(R2StorageAdapter);
  });

  it('rejects a non-R2 vendor before creating the AWS-compatible client', () => {
    expect(
      () =>
        new R2StorageAdapter({
          ...createOptions(),
          vendor: 'aws-s3'
        } as never)
    ).toThrow('Invalid storage vendor: expected "r2"');
  });
});
