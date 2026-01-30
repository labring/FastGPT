import { S3BaseBucket } from './base';
import { createDefaultStorageOptions } from '../constants';
import {
  type IAwsS3CompatibleStorageOptions,
  createStorage,
  type ICosStorageOptions,
  type IOssStorageOptions,
  type IStorageOptions
} from '@fastgpt-sdk/storage';
import { addLog } from '../../system/log';

export class S3PrivateBucket extends S3BaseBucket {
  constructor() {
    const { vendor, privateBucket, externalBaseUrl, credentials, region, ...options } =
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

    const client = createStorage({ bucket: privateBucket, ...config });

    let externalClient: ReturnType<typeof createStorage> | undefined = undefined;
    if (externalBaseUrl) {
      externalClient = createStorage({
        bucket: privateBucket,
        ...externalConfig
      } as IStorageOptions);
    }

    super(client, externalClient);

    client
      .ensureBucket()
      .then((data) => {
        addLog.debug(`Bucket "${client.bucketName}" exists:`, data);
      })
      .catch((error) => {
        addLog.error(`Failed to ensure bucket "${client.bucketName}" exists:`, error);
      });

    externalClient?.ensureBucket().catch((error) => {
      addLog.error(
        `Failed to ensure external bucket "${externalClient.bucketName}" exists:`,
        error
      );
    });
  }
}
