import { AwsS3StorageAdapter } from './adapters/aws-s3.adapter';
import { CosStorageAdapter } from './adapters/cos.adapter';
import { MinioStorageAdapter } from './adapters/minio.adapter';
import { OssStorageAdapter } from './adapters/oss.adapter';
import { R2StorageAdapter } from './adapters/r2.adapter';
import type { IStorageOptions } from './interface';

export function createStorage(
  options: IStorageOptions
):
  | AwsS3StorageAdapter
  | OssStorageAdapter
  | CosStorageAdapter
  | MinioStorageAdapter
  | R2StorageAdapter {
  switch (options.vendor) {
    case 'aws-s3': {
      return new AwsS3StorageAdapter(options);
    }

    case 'oss': {
      return new OssStorageAdapter(options);
    }

    case 'cos': {
      return new CosStorageAdapter(options);
    }

    case 'minio': {
      return new MinioStorageAdapter(options);
    }

    case 'r2': {
      return new R2StorageAdapter(options);
    }

    default: {
      throw new Error(`Unsupported storage vendor: ${String((options as any)?.vendor)}`);
    }
  }
}
