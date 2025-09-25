import { S3BaseBucket } from './base';
import { createBucketPolicy } from '../helpers';
import {
  S3Buckets,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../types';
import type { IPublicBucketOperations } from '../interface';

export class S3PublicBucket extends S3BaseBucket implements IPublicBucketOperations {
  constructor(options?: Partial<S3Options>) {
    super(
      S3Buckets.public,
      async () => {
        const bucket = this.name;
        const policy = createBucketPolicy(bucket);
        try {
          await this.client.setBucketPolicy(bucket, policy);
        } catch (error) {
          // TODO: maybe it was a cloud S3 that doesn't allow us to set the policy, so that cause the error,
          // maybe we can ignore the error, or we have other plan to handle this.
        }
      },
      options
    );
  }

  createPublicUrl(objectKey: string): string {
    const protocol = this.options.useSSL ? 'https' : 'http';
    const hostname = this.options.endPoint;
    const port = this.options.port;
    const bucket = this.name;

    return `${protocol}://${hostname}:${port}/${bucket}/${objectKey}`;
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'visibility'>
  ): Promise<CreatePostPresignedUrlResult> {
    return super.createPostPresignedUrl({ ...params, visibility: 'public' });
  }
}
