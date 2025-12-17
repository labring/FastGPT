import { S3BaseBucket } from './base';
import { createDefaultStorageOptions } from '../constants';
import {
  type IAwsS3CompatibleStorageOptions,
  createStorage,
  type ICosStorageOptions,
  type IOssStorageOptions,
  type IStorage
} from '@fastgpt-sdk/storage';

export class S3PrivateBucket extends S3BaseBucket {
  constructor() {
    const { vendor, privateBucket, externalBaseUrl, credentials, region, ...options } =
      createDefaultStorageOptions();

    let config: any = {};
    let externalConfig: any = {};
    if (vendor === 'minio') {
      config = {
        region,
        vendor,
        credentials,
        forcePathStyle: true,
        endpoint: options.endpoint!,
        maxRetries: options.maxRetries!
      } as Omit<IAwsS3CompatibleStorageOptions, 'bucket'>;
      externalConfig = {
        ...config,
        endpoint: externalBaseUrl
      };
    } else if (vendor === 'aws-s3') {
      config = {
        region,
        vendor,
        credentials,
        endpoint: options.endpoint!,
        maxRetries: options.maxRetries!
      } as Omit<IAwsS3CompatibleStorageOptions, 'bucket'>;
      externalConfig = {
        ...config,
        endpoint: externalBaseUrl
      };
    } else if (vendor === 'cos') {
      config = {
        region,
        vendor,
        credentials,
        proxy: options.proxy,
        domain: options.domain,
        protocol: options.protocol,
        useAccelerate: options.useAccelerate
      } as Omit<ICosStorageOptions, 'bucket'>;
    } else if (vendor === 'oss') {
      config = {
        region,
        vendor,
        credentials,
        endpoint: options.endpoint!,
        cname: options.cname,
        internal: options.internal,
        secure: options.secure,
        enableProxy: options.enableProxy
      } as Omit<IOssStorageOptions, 'bucket'>;
    }

    const client = createStorage({ bucket: privateBucket, ...config });

    let externalClient: IStorage | undefined = undefined;
    if (externalBaseUrl) {
      externalClient = createStorage({ bucket: privateBucket, ...externalConfig });
    }

    super(client, externalClient);

    client.ensureBucket();
    if (externalClient) {
      externalClient.ensureBucket();
    }
  }
}
