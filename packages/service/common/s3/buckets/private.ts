import { S3BaseBucket } from './base';
import { createDefaultStorageOptions } from '../config/constants';
import {
  type IAwsS3CompatibleStorageOptions,
  createStorage,
  type ICosStorageOptions,
  type IOssStorageOptions,
  type IStorageOptions
} from '@fastgpt-sdk/storage';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.S3);

export class S3PrivateBucket extends S3BaseBucket {
  constructor() {
    const storageOptions = createDefaultStorageOptions();
    const { vendor, privateBucket, externalEndpoint, credentials, region } = storageOptions;

    const getConfig = () => {
      if (vendor === 'minio') {
        const config = {
          region,
          vendor,
          credentials,
          endpoint: storageOptions.endpoint,
          maxRetries: storageOptions.maxRetries,
          forcePathStyle: storageOptions.forcePathStyle,
          publicAccessExtraSubPath: storageOptions.publicAccessExtraSubPath
        } as Omit<IAwsS3CompatibleStorageOptions, 'bucket'>;
        return {
          config,
          externalConfig: {
            ...config,
            endpoint: externalEndpoint
          }
        };
      } else if (vendor === 'aws-s3') {
        const config = {
          region,
          vendor,
          credentials,
          endpoint: storageOptions.endpoint,
          maxRetries: storageOptions.maxRetries,
          forcePathStyle: storageOptions.forcePathStyle,
          publicAccessExtraSubPath: storageOptions.publicAccessExtraSubPath
        } as Omit<IAwsS3CompatibleStorageOptions, 'bucket'>;
        return {
          config,
          externalConfig: {
            ...config,
            endpoint: externalEndpoint
          }
        };
      } else if (vendor === 'cos') {
        return {
          config: {
            region,
            vendor,
            credentials,
            proxy: storageOptions.proxy,
            domain: storageOptions.domain,
            protocol: storageOptions.protocol,
            useAccelerate: storageOptions.useAccelerate
          } as Omit<ICosStorageOptions, 'bucket'>
        };
      } else if (vendor === 'oss') {
        return {
          config: {
            region,
            vendor,
            credentials,
            endpoint: storageOptions.endpoint,
            cname: storageOptions.cname,
            internal: storageOptions.internal,
            secure: storageOptions.secure,
            enableProxy: storageOptions.enableProxy
          } as Omit<IOssStorageOptions, 'bucket'>
        };
      }
      throw new Error(`Unsupported storage vendor: ${vendor}`);
    };

    const { config, externalConfig } = getConfig();

    const client = createStorage({ bucket: privateBucket, ...config });

    let externalClient: ReturnType<typeof createStorage> | undefined = undefined;
    if (externalEndpoint) {
      externalClient = createStorage({
        bucket: privateBucket,
        ...externalConfig
      } as IStorageOptions);
    }

    super(client, externalClient);

    client
      .ensureBucket()
      .then((data) => {
        logger.debug('Private bucket exists', {
          bucketName: client.bucketName,
          data
        });
      })
      .catch((error) => {
        logger.error('Failed to ensure private bucket exists', {
          bucketName: client.bucketName,
          error
        });
      });

    externalClient?.ensureBucket().catch((error) => {
      logger.error('Failed to ensure external private bucket exists', {
        bucketName: externalClient.bucketName,
        error
      });
    });
  }
}
