import { S3BaseBucket } from './base';
import { createDefaultStorageOptions } from '../constants';
import {
  type IAwsS3CompatibleStorageOptions,
  type ICosStorageOptions,
  type IOssStorageOptions,
  createStorage,
  type IStorage,
  type MinioStorageAdapter
} from '@fastgpt-sdk/storage';

export class S3PublicBucket extends S3BaseBucket {
  constructor() {
    const { vendor, publicBucket, externalBaseUrl, credentials, region, ...options } =
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

    const client = createStorage({ bucket: publicBucket, ...config });

    let externalClient: IStorage | undefined = undefined;
    if (externalBaseUrl) {
      externalClient = createStorage({ bucket: publicBucket, ...externalConfig });
    }

    super(client, externalClient);

    client.ensureBucket().then(() => {
      if (vendor !== 'minio') return;
      (client as MinioStorageAdapter).ensurePublicBucketPolicy();
    });

    if (externalClient) {
      externalClient.ensureBucket().then(() => {
        if (vendor !== 'minio') return;
        (externalClient as MinioStorageAdapter).ensurePublicBucketPolicy();
      });
    }
  }

  createPublicUrl(objectKey: string): string {
    return this.externalClient.generatePublicGetUrl({ key: objectKey }).publicGetUrl;
  }
}
