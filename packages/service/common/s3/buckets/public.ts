import { S3BaseBucket } from './base';
import { createDefaultStorageOptions } from '../constants';
import {
  type IAwsS3CompatibleStorageOptions,
  type ICosStorageOptions,
  type IOssStorageOptions,
  createStorage,
  MinioStorageAdapter,
  type IStorageOptions
} from '@fastgpt-sdk/storage';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.S3);

export class S3PublicBucket extends S3BaseBucket {
  constructor() {
    const { vendor, publicBucket, externalBaseUrl, credentials, region, ...options } =
      createDefaultStorageOptions();

    const { config, externalConfig } = (() => {
      if (vendor === 'minio') {
        const config = {
          region,
          vendor,
          credentials,
          endpoint: options.endpoint!,
          maxRetries: options.maxRetries!,
          forcePathStyle: options.forcePathStyle,
          publicAccessExtraSubPath: options.publicAccessExtraSubPath
        } as Omit<IAwsS3CompatibleStorageOptions, 'bucket'>;
        return {
          config,
          externalConfig: {
            ...config,
            endpoint: externalBaseUrl
          }
        };
      } else if (vendor === 'aws-s3') {
        const config = {
          region,
          vendor,
          credentials,
          endpoint: options.endpoint!,
          maxRetries: options.maxRetries!,
          forcePathStyle: options.forcePathStyle,
          publicAccessExtraSubPath: options.publicAccessExtraSubPath
        } as Omit<IAwsS3CompatibleStorageOptions, 'bucket'>;
        return {
          config,
          externalConfig: {
            ...config,
            endpoint: externalBaseUrl
          }
        };
      } else if (vendor === 'cos') {
        return {
          config: {
            region,
            vendor,
            credentials,
            proxy: options.proxy,
            domain: options.domain,
            protocol: options.protocol,
            useAccelerate: options.useAccelerate
          } as Omit<ICosStorageOptions, 'bucket'>
        };
      } else if (vendor === 'oss') {
        return {
          config: {
            region,
            vendor,
            credentials,
            endpoint: options.endpoint!,
            cname: options.cname,
            internal: options.internal,
            secure: options.secure,
            enableProxy: options.enableProxy
          } as Omit<IOssStorageOptions, 'bucket'>
        };
      }
      throw new Error(`Unsupported storage vendor: ${vendor}`);
    })();

    const client = createStorage({ bucket: publicBucket, ...config });

    let externalClient: ReturnType<typeof createStorage> | undefined = undefined;
    if (externalBaseUrl) {
      externalClient = createStorage({
        bucket: publicBucket,
        ...externalConfig
      } as IStorageOptions);
    }

    super(client, externalClient);

    client
      .ensureBucket()
      .then(() => {
        if (!(client instanceof MinioStorageAdapter)) {
          return;
        }

        client.ensurePublicBucketPolicy().catch((error) => {
          logger.warn('Failed to ensure public bucket policy', {
            bucketName: client.bucketName,
            error
          });
        });
      })
      .catch((error) => {
        logger.error('Failed to ensure public bucket exists', {
          bucketName: client.bucketName,
          error
        });
      });

    externalClient
      ?.ensureBucket()
      .then(() => {
        if (!(externalClient instanceof MinioStorageAdapter)) {
          return;
        }

        externalClient.ensurePublicBucketPolicy().catch((error) => {
          logger.warn('Failed to ensure external public bucket policy', {
            bucketName: externalClient.bucketName,
            error
          });
        });
      })
      .catch((error) => {
        logger.error('Failed to ensure external public bucket exists', {
          bucketName: externalClient.bucketName,
          error
        });
      });
  }

  createPublicUrl(objectKey: string): string {
    return this.externalClient.generatePublicGetUrl({ key: objectKey }).url;
  }
}
