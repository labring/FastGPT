import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  S3Client,
  type BucketLocationConstraint
} from '@aws-sdk/client-s3';
import OSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import * as Minio from 'minio';
import { createStorage } from '../../src/factory';
import type { IStorage } from '../../src/interface';
import type { EnsureBucketResult } from '../../src/types';
import { removeIntegrationBucketIfExists } from './helpers';

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

const getTestBucket = (envName: string): string => {
  const bucket = getRequiredEnv(envName);
  if (!bucket.startsWith('fastgpt-sdk-')) {
    throw new Error(`${envName} must start with "fastgpt-sdk-" to protect non-test buckets`);
  }
  return bucket;
};

const isBucketNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const value = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    value.code === 'NoSuchBucket' ||
    value.code === 'NotFound' ||
    value.status === 404 ||
    value.statusCode === 404 ||
    value.$metadata?.httpStatusCode === 404
  );
};

const createContextResult = async ({
  provider,
  storage,
  bucket,
  initialEnsureResult,
  createStorage,
  bucketExists,
  deleteBucket,
  destroyProvider
}: {
  provider: StorageIntegrationProviderName;
  storage: IStorage;
  bucket: string;
  initialEnsureResult: EnsureBucketResult;
  createStorage: () => IStorage;
  bucketExists: () => Promise<boolean>;
  deleteBucket: () => Promise<void>;
  destroyProvider?: () => Promise<void> | void;
}): Promise<StorageIntegrationContext> => ({
  provider,
  storage,
  bucket,
  rootPrefix: `contract/${randomUUID()}/`,
  initialEnsureResult,
  createStorage,
  cleanup: async () => {
    try {
      await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
    } finally {
      try {
        await storage.destroy();
      } finally {
        await destroyProvider?.();
      }
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
    const bucket = getTestBucket('STORAGE_TEST_MINIO_BUCKET');
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
    const bucketExists = () => adminClient.bucketExists(bucket);
    const deleteBucket = () => adminClient.removeBucket(bucket);
    await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'minio',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createMinioStorage,
      bucketExists,
      deleteBucket
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
    const bucket = getTestBucket('STORAGE_TEST_AWS_S3_BUCKET');
    const adminClient = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey }
    });
    const bucketExists = async () => {
      try {
        await adminClient.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
      } catch (error) {
        if (isBucketNotFoundError(error)) return false;
        throw error;
      }
    };
    const deleteBucket = () =>
      adminClient.send(new DeleteBucketCommand({ Bucket: bucket })).then(() => undefined);
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
    await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
    await adminClient.send(
      new CreateBucketCommand({
        Bucket: bucket,
        CreateBucketConfiguration:
          region === 'us-east-1'
            ? undefined
            : { LocationConstraint: region as BucketLocationConstraint }
      })
    );
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'aws-s3',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createAwsStorage,
      bucketExists,
      deleteBucket,
      destroyProvider: () => adminClient.destroy()
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
    const bucket = getTestBucket('STORAGE_TEST_OSS_BUCKET');
    const adminClient = new OSS({
      endpoint,
      region,
      accessKeyId,
      accessKeySecret: secretAccessKey
    });
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
    const bucketExists = async () => {
      try {
        await adminClient.getBucketInfo(bucket);
        return true;
      } catch (error) {
        if (isBucketNotFoundError(error)) return false;
        throw error;
      }
    };
    const deleteBucket = () => adminClient.deleteBucket(bucket).then(() => undefined);
    await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
    await adminClient.putBucket(bucket);
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'oss',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createOssStorage,
      bucketExists,
      deleteBucket
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
    const bucket = getTestBucket('STORAGE_TEST_COS_BUCKET');
    if (!bucket.endsWith(`-${appId}`)) {
      throw new Error('STORAGE_TEST_COS_BUCKET must end with the configured COS app ID');
    }
    const adminClient = new COS({ SecretId: accessKeyId, SecretKey: secretAccessKey });
    const createCosStorage = () =>
      createStorage({
        vendor: 'cos',
        bucket,
        region,
        protocol: 'https:',
        credentials: { accessKeyId, secretAccessKey }
      });
    const storage = createCosStorage();
    const bucketExists = async () => {
      try {
        await adminClient.headBucket({ Bucket: bucket, Region: region });
        return true;
      } catch (error) {
        if (isBucketNotFoundError(error)) return false;
        throw error;
      }
    };
    const deleteBucket = () =>
      adminClient.deleteBucket({ Bucket: bucket, Region: region }).then(() => undefined);
    await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
    await adminClient.putBucket({ Bucket: bucket, Region: region });
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'cos',
      storage,
      bucket,
      initialEnsureResult,
      createStorage: createCosStorage,
      bucketExists,
      deleteBucket
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
