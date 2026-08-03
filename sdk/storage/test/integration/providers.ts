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
import { clearIntegrationBucketObjects, removeIntegrationBucketIfExists } from './helpers';

export type StorageIntegrationProviderName = 'aws-s3' | 'r2' | 'minio' | 'oss' | 'cos';

export type StorageIntegrationContext = {
  provider: StorageIntegrationProviderName;
  storage: IStorage;
  publicStorage?: IStorage;
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

export const ValidTestBucketNamePrefixPattern =
  /^(?:fastgpt-sdk(?:\.|-)integration-|s3-test-|fastgpt-test-)/;
const getR2TestBucket = (envName: string): string => {
  const bucket = getRequiredEnv(envName);
  if (bucket.startsWith('s3-test-')) return bucket;
  throw new Error(`Met invalid R2 test bucket name to protect non-test buckets`);
};
const getTestBucket = (envName: string): string => {
  const bucket = getRequiredEnv(envName);
  if (ValidTestBucketNamePrefixPattern.test(bucket)) {
    return bucket;
  }
  throw new Error(`Met invalid bucket name to protect non-test buckets`);
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

const isBucketAlreadyExistsError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; code?: unknown };
  const identifiers = [value.name, value.code].map(String);
  return identifiers.some((identifier) =>
    ['BucketAlreadyExists', 'BucketAlreadyOwnedByYou', 'BucketAlreadyExistsError'].includes(
      identifier
    )
  );
};

/**
 * 创建云端测试 bucket，并容忍删除后的全局命名空间最终一致性窗口。
 * 若 bucket 已被其他账号占用，最终会保留原始错误而不会误用该 bucket。
 */
const ensureTestBucket = async ({
  bucketExists,
  createBucket
}: {
  bucketExists: () => Promise<boolean>;
  createBucket: () => Promise<void>;
}): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await bucketExists()) return;

    try {
      await createBucket();
      return;
    } catch (error) {
      if (!isBucketAlreadyExistsError(error)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error('Unable to create integration test bucket');
};

const createContextResult = async ({
  provider,
  storage,
  publicStorage,
  bucket,
  initialEnsureResult,
  createStorage,
  bucketExists,
  deleteBucket,
  preserveBucket,
  destroyProvider
}: {
  provider: StorageIntegrationProviderName;
  storage: IStorage;
  publicStorage?: IStorage;
  bucket: string;
  initialEnsureResult: EnsureBucketResult;
  createStorage: () => IStorage;
  bucketExists: () => Promise<boolean>;
  deleteBucket: () => Promise<void>;
  preserveBucket?: boolean;
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
      if (preserveBucket) {
        await clearIntegrationBucketObjects({ storage, bucketExists });
      } else {
        await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
      }
    } finally {
      try {
        await storage.destroy();
      } finally {
        await publicStorage?.destroy();
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
    const bucket = getTestBucket('STORAGE_TEST_MINIO_PRIVATE_BUCKET');
    const publicBucket = getTestBucket('STORAGE_TEST_MINIO_PUBLIC_BUCKET');
    const publicEndpoint = getRequiredEnv('STORAGE_TEST_MINIO_PUBLIC_ENDPOINT');
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
    const publicStorage = createStorage({
      vendor: 'minio',
      bucket: publicBucket,
      endpoint,
      region,
      forcePathStyle: true,
      maxRetries: 1,
      publicEndpoint,
      credentials: { accessKeyId, secretAccessKey }
    });
    await publicStorage.ensureBucket();
    const bucketExists = () => adminClient.bucketExists(bucket);
    const deleteBucket = () => adminClient.removeBucket(bucket);
    await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'minio',
      storage,
      publicStorage,
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
    const bucket = getTestBucket('STORAGE_TEST_AWS_S3_PRIVATE_BUCKET');
    const publicBucket = getTestBucket('STORAGE_TEST_AWS_S3_PUBLIC_BUCKET');
    const publicEndpoint = getRequiredEnv('STORAGE_TEST_AWS_S3_PUBLIC_ENDPOINT');
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
    const publicStorage = createStorage({
      vendor: 'aws-s3',
      bucket: publicBucket,
      endpoint,
      region,
      forcePathStyle,
      maxRetries: 1,
      publicEndpoint,
      credentials: { accessKeyId, secretAccessKey }
    });
    await publicStorage.ensureBucket();
    await clearIntegrationBucketObjects({ storage, bucketExists });
    await ensureTestBucket({
      bucketExists,
      createBucket: () =>
        adminClient
          .send(
            new CreateBucketCommand({
              Bucket: bucket,
              CreateBucketConfiguration:
                region === 'us-east-1'
                  ? undefined
                  : { LocationConstraint: region as BucketLocationConstraint }
            })
          )
          .then(() => undefined)
    });
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'aws-s3',
      storage,
      publicStorage,
      bucket,
      initialEnsureResult,
      createStorage: createAwsStorage,
      bucketExists,
      deleteBucket,
      preserveBucket: true,
      destroyProvider: () => adminClient.destroy()
    });
  }
});

const createR2Provider = (): StorageIntegrationProvider => ({
  name: 'r2',
  enabled: isEnabled('STORAGE_TEST_R2_ENABLED'),
  createContext: async () => {
    const endpoint = getRequiredEnv('STORAGE_TEST_R2_ENDPOINT');
    const region = getRequiredEnv('STORAGE_TEST_R2_REGION');
    const accessKeyId = getRequiredEnv('STORAGE_TEST_R2_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('STORAGE_TEST_R2_SECRET_ACCESS_KEY');
    const bucket = getR2TestBucket('STORAGE_TEST_R2_PRIVATE_BUCKET');
    getR2TestBucket('STORAGE_TEST_R2_PUBLIC_BUCKET');
    const publicEndpoint = getRequiredEnv('STORAGE_TEST_R2_PUBLIC_ENDPOINT');
    const credentials = { accessKeyId, secretAccessKey };
    const adminClient = new S3Client({
      endpoint,
      region,
      credentials,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
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
    const createR2Storage = () =>
      createStorage({
        vendor: 'r2',
        bucket,
        endpoint,
        region,
        forcePathStyle: false,
        maxRetries: 1,
        publicEndpoint,
        credentials
      });
    const storage = createR2Storage();
    const publicStorage = createStorage({
      vendor: 'r2',
      bucket: getR2TestBucket('STORAGE_TEST_R2_PUBLIC_BUCKET'),
      endpoint,
      region,
      forcePathStyle: false,
      maxRetries: 1,
      publicEndpoint,
      credentials
    });
    await publicStorage.ensureBucket();
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'r2',
      storage,
      publicStorage,
      bucket,
      initialEnsureResult,
      createStorage: createR2Storage,
      bucketExists,
      deleteBucket,
      preserveBucket: true,
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
    const bucket = getTestBucket('STORAGE_TEST_OSS_PRIVATE_BUCKET');
    const publicBucket = getTestBucket('STORAGE_TEST_OSS_PUBLIC_BUCKET');
    const publicEndpoint = getRequiredEnv('STORAGE_TEST_OSS_PUBLIC_ENDPOINT');
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
    const publicStorage = createStorage({
      vendor: 'oss',
      bucket: publicBucket,
      region,
      endpoint: new URL(publicEndpoint).host,
      cname: true,
      secure: true,
      credentials: { accessKeyId, secretAccessKey }
    });
    await publicStorage.ensureBucket();
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
    await clearIntegrationBucketObjects({ storage, bucketExists });
    await ensureTestBucket({
      bucketExists,
      createBucket: () => adminClient.putBucket(bucket).then(() => undefined)
    });
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'oss',
      storage,
      publicStorage,
      bucket,
      initialEnsureResult,
      createStorage: createOssStorage,
      bucketExists,
      deleteBucket,
      preserveBucket: true
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
    const bucket = getTestBucket('STORAGE_TEST_COS_PRIVATE_BUCKET');
    const publicBucket = getTestBucket('STORAGE_TEST_COS_PUBLIC_BUCKET');
    const publicEndpoint = getRequiredEnv('STORAGE_TEST_COS_PUBLIC_ENDPOINT');
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
    const publicStorage = createStorage({
      vendor: 'cos',
      bucket: publicBucket,
      region,
      protocol: 'https:',
      domain: new URL(publicEndpoint).host,
      credentials: { accessKeyId, secretAccessKey }
    });
    await publicStorage.ensureBucket();
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
    await clearIntegrationBucketObjects({ storage, bucketExists });
    await ensureTestBucket({
      bucketExists,
      createBucket: () =>
        adminClient.putBucket({ Bucket: bucket, Region: region }).then(() => undefined)
    });
    const initialEnsureResult = await storage.ensureBucket();

    return createContextResult({
      provider: 'cos',
      storage,
      publicStorage,
      bucket,
      initialEnsureResult,
      createStorage: createCosStorage,
      bucketExists,
      deleteBucket,
      preserveBucket: true
    });
  }
});

export const minioIntegrationProvider = createMinioProvider();

export const storageIntegrationProviders: StorageIntegrationProvider[] = [
  createAwsS3Provider(),
  createR2Provider(),
  minioIntegrationProvider,
  createOssProvider(),
  createCosProvider()
];
