import { S3BaseBucket } from './base';
import { createBucketPolicy } from '../helpers';
import {
  S3Buckets,
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../types';
import type { IPublicBucketOperations } from '../interface';
import { lifecycleOfTemporaryAvatars } from '../lifecycle';

export class S3PublicBucket extends S3BaseBucket implements IPublicBucketOperations {
  constructor(options?: Partial<S3Options>) {
    super(
      S3Buckets.public,
      [
        // set bucket policy
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
        // set bucket lifecycle
        async () => {
          const bucket = this.name;
          await this.client.setBucketLifecycle(bucket, lifecycleOfTemporaryAvatars);
        }
      ],
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
    params: Omit<CreatePostPresignedUrlParams, 'visibility'>,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    return super.createPostPresignedUrl({ ...params, visibility: 'public' }, options);
  }
}
