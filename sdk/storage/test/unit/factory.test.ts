import { describe, expect, it } from 'vitest';
import { AwsS3StorageAdapter } from '../../src/adapters/aws-s3.adapter';
import { CosStorageAdapter } from '../../src/adapters/cos.adapter';
import { MinioStorageAdapter } from '../../src/adapters/minio.adapter';
import { OssStorageAdapter } from '../../src/adapters/oss.adapter';
import { R2StorageAdapter } from '../../src/adapters/r2.adapter';
import { createStorage } from '../../src/factory';

const credentials = {
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key'
};

describe('createStorage', () => {
  it('creates every supported adapter from its discriminated options', () => {
    expect(
      createStorage({
        vendor: 'aws-s3',
        bucket: 'bucket',
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        credentials
      })
    ).toBeInstanceOf(AwsS3StorageAdapter);
    expect(
      createStorage({
        vendor: 'minio',
        bucket: 'bucket',
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        credentials
      })
    ).toBeInstanceOf(MinioStorageAdapter);
    expect(
      createStorage({
        vendor: 'r2',
        bucket: 'bucket',
        endpoint: 'https://account.r2.cloudflarestorage.com',
        region: 'auto',
        credentials
      })
    ).toBeInstanceOf(R2StorageAdapter);
    expect(
      createStorage({
        vendor: 'oss',
        bucket: 'bucket',
        region: 'oss-cn-hangzhou',
        credentials
      })
    ).toBeInstanceOf(OssStorageAdapter);
    expect(
      createStorage({
        vendor: 'cos',
        bucket: 'bucket',
        region: 'ap-guangzhou',
        credentials
      })
    ).toBeInstanceOf(CosStorageAdapter);
  });

  it('rejects an unsupported runtime vendor', () => {
    expect(() => createStorage({ vendor: 'unknown' } as never)).toThrow(
      'Unsupported storage vendor: unknown'
    );
  });

  it('rejects the reserved BOS vendor until an adapter is implemented', () => {
    expect(() => createStorage({ vendor: 'bos' } as never)).toThrow(
      'Unsupported storage vendor: bos'
    );
  });
});
