import { describe, expect, it, vi } from 'vitest';
import type { IStorage } from '../../src/interface';
import { AwsS3StorageAdapter } from '../../src/adapters/aws-s3.adapter';
import { CosStorageAdapter } from '../../src/adapters/cos.adapter';
import { MinioStorageAdapter } from '../../src/adapters/minio.adapter';
import { OssStorageAdapter } from '../../src/adapters/oss.adapter';
import { InvalidStorageObjectKeyError } from '../../src/errors';
import { createVitestStorageMock } from '../../src/testing/vitestMock';

type GuardedStorage = {
  storage: IStorage;
  remoteCall: ReturnType<typeof vi.fn>;
};

const unexpectedRemoteCall = () => {
  throw new Error('Object key was not validated before the remote SDK call');
};

const createAwsStorage = (): GuardedStorage => {
  const storage = new AwsS3StorageAdapter({
    vendor: 'aws-s3',
    bucket: 'test-bucket',
    endpoint: 'http://127.0.0.1:1',
    region: 'us-east-1',
    forcePathStyle: true,
    maxRetries: 1,
    credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
  });
  const remoteCall = vi.fn(unexpectedRemoteCall);
  (storage as any).client.send = remoteCall;
  return { storage, remoteCall };
};

const createMinioStorage = (): GuardedStorage => {
  const storage = new MinioStorageAdapter({
    vendor: 'minio',
    bucket: 'test-bucket',
    endpoint: 'http://127.0.0.1:1',
    region: 'us-east-1',
    forcePathStyle: true,
    maxRetries: 1,
    credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
  });
  const remoteCall = vi.fn(unexpectedRemoteCall);
  (storage as any).client.send = remoteCall;
  (storage as any).minioClient.removeObject = remoteCall;
  (storage as any).minioClient.removeObjects = remoteCall;
  return { storage, remoteCall };
};

const createOssStorage = (): GuardedStorage => {
  const storage = new OssStorageAdapter({
    vendor: 'oss',
    bucket: 'test-bucket',
    endpoint: 'http://127.0.0.1:1',
    region: 'oss-cn-hangzhou',
    secure: false,
    credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
  });
  const remoteCall = vi.fn(unexpectedRemoteCall);
  Object.assign((storage as any).client, {
    head: remoteCall,
    put: remoteCall,
    getStream: remoteCall,
    delete: remoteCall,
    deleteMulti: remoteCall,
    list: remoteCall,
    signatureUrlV4: remoteCall,
    signatureUrl: remoteCall,
    copy: remoteCall
  });
  return { storage, remoteCall };
};

const createCosStorage = (): GuardedStorage => {
  const storage = new CosStorageAdapter({
    vendor: 'cos',
    bucket: 'test-bucket',
    region: 'ap-guangzhou',
    credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
  });
  const remoteCall = vi.fn(unexpectedRemoteCall);
  Object.assign((storage as any).client, {
    headObject: remoteCall,
    putObject: remoteCall,
    getObject: remoteCall,
    deleteObject: remoteCall,
    deleteMultipleObject: remoteCall,
    getBucket: remoteCall,
    getObjectUrl: remoteCall,
    sliceCopyFile: remoteCall
  });
  return { storage, remoteCall };
};

const createMockStorage = (): GuardedStorage => ({
  storage: createVitestStorageMock({ vi }),
  remoteCall: vi.fn()
});

const storageFactories = [
  ['AWS S3', createAwsStorage],
  ['MinIO', createMinioStorage],
  ['OSS', createOssStorage],
  ['COS', createCosStorage],
  ['Vitest mock', createMockStorage]
] as const;

const invalidKey = 'invalid//key';
const keyOperations: ReadonlyArray<
  [name: string, field: string, operation: (storage: IStorage) => unknown]
> = [
  ['checkObjectExists', 'key', (storage) => storage.checkObjectExists({ key: invalidKey })],
  ['getObjectMetadata', 'key', (storage) => storage.getObjectMetadata({ key: invalidKey })],
  ['uploadObject', 'key', (storage) => storage.uploadObject({ key: invalidKey, body: 'body' })],
  ['downloadObject', 'key', (storage) => storage.downloadObject({ key: invalidKey })],
  ['deleteObject', 'key', (storage) => storage.deleteObject({ key: invalidKey })],
  [
    'deleteObjectsByMultiKeys',
    'keys[1]',
    (storage) => storage.deleteObjectsByMultiKeys({ keys: ['valid/key', invalidKey] })
  ],
  [
    'deleteObjectsByPrefix',
    'prefix',
    (storage) => storage.deleteObjectsByPrefix({ prefix: invalidKey })
  ],
  [
    'generatePresignedPutUrl',
    'key',
    (storage) => storage.generatePresignedPutUrl({ key: invalidKey })
  ],
  [
    'generatePresignedGetUrl',
    'key',
    (storage) => storage.generatePresignedGetUrl({ key: invalidKey })
  ],
  ['generatePublicGetUrl', 'key', (storage) => storage.generatePublicGetUrl({ key: invalidKey })],
  ['listObjects', 'prefix', (storage) => storage.listObjects({ prefix: invalidKey })],
  [
    'copyObjectInSelfBucket source',
    'sourceKey',
    (storage) =>
      storage.copyObjectInSelfBucket({ sourceKey: invalidKey, targetKey: 'valid/target' })
  ],
  [
    'copyObjectInSelfBucket target',
    'targetKey',
    (storage) =>
      storage.copyObjectInSelfBucket({ sourceKey: 'valid/source', targetKey: invalidKey })
  ]
];

type KeyContractCase = readonly [
  storageName: string,
  operationName: string,
  field: string,
  createStorage: () => GuardedStorage,
  operation: (storage: IStorage) => unknown
];

const keyContractCases: KeyContractCase[] = storageFactories.flatMap(
  ([storageName, createStorage]) =>
    keyOperations.map<KeyContractCase>(([operationName, field, operation]) => [
      storageName,
      operationName,
      field,
      createStorage,
      operation
    ])
);

describe('IStorage object key preflight contract', () => {
  it.each(keyContractCases)(
    '%s validates %s before dispatch',
    async (_storageName, _operationName, field, createStorage, operation) => {
      const { storage, remoteCall } = createStorage();

      await expect(Promise.resolve().then(() => operation(storage))).rejects.toMatchObject({
        name: InvalidStorageObjectKeyError.name,
        field,
        reason: 'empty_path_segment'
      });
      expect(remoteCall).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['AWS S3', createAwsStorage],
    ['MinIO', createMinioStorage]
  ] as const)(
    '%s validates every key before deleting the first 1000-key batch',
    async (_, createStorage) => {
      const { storage, remoteCall } = createStorage();
      const keys = Array.from({ length: 1000 }, (_, index) => `valid/${index}`).concat(invalidKey);

      await expect(storage.deleteObjectsByMultiKeys({ keys })).rejects.toBeInstanceOf(
        InvalidStorageObjectKeyError
      );
      expect(remoteCall).not.toHaveBeenCalled();
    }
  );
});
