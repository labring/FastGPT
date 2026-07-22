import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type BucketLocationConstraint
} from '@aws-sdk/client-s3';
import OSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import * as Minio from 'minio';
import { createStorage } from '../../src/factory';
import type { IStorage } from '../../src/interface';
import type { EnsureBucketResult } from '../../src/types';

export type StorageIntegrationProviderName = 'aws-s3' | 'minio' | 'oss' | 'cos';

export type StorageIntegrationContext = {
  provider: StorageIntegrationProviderName;
  storage: IStorage;
  bucket: string;
  rootPrefix: string;
  initialEnsureResult: EnsureBucketResult;
  createStorage: () => IStorage;
  cleanup: () => Promise<void>;
};

export type StorageIntegrationProvider = {
  name: StorageIntegrationProviderName;
  enabled: boolean;
  createContext: () => Promise<StorageIntegrationContext>;
};

const isEnabled = (name: string) => process.env[name]?.toLowerCase() === 'true';

const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing integration test environment variable: ${name}`);
  return value;
};

const createBucketName = (provider: StorageIntegrationProviderName, suffix = '') => {
  const uniquePart = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  return `fastgpt-sdk-${provider}-${uniquePart}${suffix}`.toLowerCase();
};

const clearBucket = async (storage: IStorage) => {
  const { keys } = await storage.listObjects({});
  if (keys.length === 0) return;

  const { keys: failedKeys } = await storage.deleteObjectsByMultiKeys({ keys });
  if (failedKeys.length > 0) {
    throw new Error(`Failed to clean integration test bucket: ${failedKeys.join(', ')}`);
  }
};

const createContextResult = async ({
  provider,
  storage,
  bucket,
  initialEnsureResult,
  createStorage,
  deleteBucket
}: {
  provider: StorageIntegrationProviderName;
  storage: IStorage;
  bucket: string;
  initialEnsureResult: EnsureBucketResult;
  createStorage: () => IStorage;
  deleteBucket: () => Promise<void>;
}): Promise<StorageIntegrationContext> => ({
  provider,
  storage,
  bucket,
  rootPrefix: `contract/${randomUUID()}/`,
  initialEnsureResult,
  createStorage,
  cleanup: async () => {
    try {
      await clearBucket(storage);
      await deleteBucket();
    } finally {
      await storage.destroy();
    }
  }
});

const createMinioProvider = (): StorageIntegrationProvider => ({
  name: 'minio',
  enabled: isEnabled('STORAGE_TEST_MINIO_ENABLED'),
  createContext: async () => {
    const endpoint = getRequiredEnv('STORAGE_TEST_MINIO_ENDPOINT');
    const region = getRequiredEnv('STORAGE_TEST_MINIO_REGION');
    const accessKeyId = getRequiredEnv('STORAGE_TEST_MINIO_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('STORAGE_TEST_MINIO_SECRET_ACCESS_KEY');
    const endpointUrl = new URL(endpoint);
    const useSSL = endpointUrl.protocol === 'https:';
    const bucket = createBucketName('minio');
    const adminClient = new Minio.Client({
      endPoint: endpointUrl.hostname,
      port: endpointUrl.port ? Number(endpointUrl.port) : useSSL ? 443 : 80,
      useSSL,
      accessKey: accessKeyId,
      secretKey: secretAccessKey,
      region
    });
    const createMinioStorage = () =>
      createStorage({
        vendor: 'minio',
        bucket,
        endpoint,
        region,
        forcePathStyle: true,
        maxRetries: 1,
        credentials: { accessKeyId, secretAccessKey }
      });
    const storage = createMinioStorage();
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'minio',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createMinioStorage,
      deleteBucket: () => adminClient.removeBucket(bucket)
    });
  }
});

const createAwsS3Provider = (): StorageIntegrationProvider => ({
  name: 'aws-s3',
  enabled: isEnabled('STORAGE_TEST_AWS_S3_ENABLED'),
  createContext: async () => {
    const endpoint = getRequiredEnv('STORAGE_TEST_AWS_S3_ENDPOINT');
    const region = getRequiredEnv('STORAGE_TEST_AWS_S3_REGION');
    const accessKeyId = getRequiredEnv('STORAGE_TEST_AWS_S3_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('STORAGE_TEST_AWS_S3_SECRET_ACCESS_KEY');
    const forcePathStyle = isEnabled('STORAGE_TEST_AWS_S3_FORCE_PATH_STYLE');
    const bucket = createBucketName('aws-s3');
    const adminClient = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey }
    });
    await adminClient.send(
      new CreateBucketCommand({
        Bucket: bucket,
        CreateBucketConfiguration:
          region === 'us-east-1'
            ? undefined
            : { LocationConstraint: region as BucketLocationConstraint }
      })
    );
    const createAwsStorage = () =>
      createStorage({
        vendor: 'aws-s3',
        bucket,
        endpoint,
        region,
        forcePathStyle,
        maxRetries: 1,
        credentials: { accessKeyId, secretAccessKey }
      });
    const storage = createAwsStorage();
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'aws-s3',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createAwsStorage,
      deleteBucket: async () => {
        let continuationToken: string | undefined;
        do {
          const response = await adminClient.send(
            new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken })
          );
          const objects = (response.Contents ?? []).flatMap(({ Key }) => (Key ? [{ Key }] : []));
          if (objects.length > 0) {
            await adminClient.send(
              new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } })
            );
          }
          continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);
        await adminClient.send(new DeleteBucketCommand({ Bucket: bucket }));
        adminClient.destroy();
      }
    });
  }
});

const createOssProvider = (): StorageIntegrationProvider => ({
  name: 'oss',
  enabled: isEnabled('STORAGE_TEST_OSS_ENABLED'),
  createContext: async () => {
    const endpoint = getRequiredEnv('STORAGE_TEST_OSS_ENDPOINT');
    const region = getRequiredEnv('STORAGE_TEST_OSS_REGION');
    const accessKeyId = getRequiredEnv('STORAGE_TEST_OSS_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('STORAGE_TEST_OSS_SECRET_ACCESS_KEY');
    const bucket = createBucketName('oss');
    const adminClient = new OSS({
      endpoint,
      region,
      accessKeyId,
      accessKeySecret: secretAccessKey
    });
    await adminClient.putBucket(bucket);
    const createOssStorage = () =>
      createStorage({
        vendor: 'oss',
        bucket,
        endpoint,
        region,
        secure: endpoint.startsWith('https:'),
        credentials: { accessKeyId, secretAccessKey }
      });
    const storage = createOssStorage();
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'oss',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createOssStorage,
      deleteBucket: () => adminClient.deleteBucket(bucket).then(() => undefined)
    });
  }
});

const createCosProvider = (): StorageIntegrationProvider => ({
  name: 'cos',
  enabled: isEnabled('STORAGE_TEST_COS_ENABLED'),
  createContext: async () => {
    const region = getRequiredEnv('STORAGE_TEST_COS_REGION');
    const appId = getRequiredEnv('STORAGE_TEST_COS_APP_ID');
    const accessKeyId = getRequiredEnv('STORAGE_TEST_COS_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('STORAGE_TEST_COS_SECRET_ACCESS_KEY');
    const bucket = createBucketName('cos', `-${appId}`);
    const adminClient = new COS({ SecretId: accessKeyId, SecretKey: secretAccessKey });
    await adminClient.putBucket({ Bucket: bucket, Region: region });
    const createCosStorage = () =>
      createStorage({
        vendor: 'cos',
        bucket,
        region,
        protocol: 'https:',
        credentials: { accessKeyId, secretAccessKey }
      });
    const storage = createCosStorage();
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'cos',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createCosStorage,
      deleteBucket: () =>
        adminClient.deleteBucket({ Bucket: bucket, Region: region }).then(() => undefined)
    });
  }
});

export const minioIntegrationProvider = createMinioProvider();

export const storageIntegrationProviders: StorageIntegrationProvider[] = [
  createAwsS3Provider(),
  minioIntegrationProvider,
  createOssProvider(),
  createCosProvider()
];
