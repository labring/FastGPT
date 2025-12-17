import { AwsS3StorageAdapter } from './aws-s3.adapter';
import type { IAwsS3CompatibleStorageOptions, IStorage } from '../interface';
import type { EnsureBucketResult } from '../types';
import { CreateBucketCommand, NotFound, PutBucketPolicyCommand } from '@aws-sdk/client-s3';

/**
 * 注意：
 * - 无论传入的 forcePathStyle 是什么，都强制使用 path style URLs
 * - 只有 MinIO 这类 self-hosted 的存储服务会在存储桶不存在时 自动创建两个类型的存储桶
 */
export class MinioStorageAdapter extends AwsS3StorageAdapter implements IStorage {
  constructor(protected readonly options: IAwsS3CompatibleStorageOptions) {
    if (options.vendor !== 'minio') {
      throw new Error('Invalid storage vendor');
    }

    options.forcePathStyle = true;

    super(options);
  }

  async ensureBucket(): Promise<EnsureBucketResult> {
    try {
      return await super.ensureBucket();
    } catch (error) {
      if (!(error instanceof NotFound)) {
        throw error;
      }

      await this.client.send(new CreateBucketCommand({ Bucket: this.options.bucket }));

      return {
        exists: false,
        created: true,
        bucket: this.options.bucket
      };
    }
  }

  async ensurePublicBucketPolicy(): Promise<void> {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.options.bucket}/*`]
        }
      ]
    };

    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.options.bucket,
        Policy: JSON.stringify(policy)
      })
    );
  }
}
