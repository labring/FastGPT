import { S3BaseSource } from './base';
import {
  S3Sources,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../types';
import type { S3PublicBucket } from '../buckets/public';

class S3AvatarSource extends S3BaseSource<S3PublicBucket> {
  constructor(options?: Partial<S3Options>) {
    super(S3Sources.avatar, true, options);
  }

  static getInstance(options?: Partial<S3Options>): S3AvatarSource {
    return S3BaseSource._getInstance(S3AvatarSource, options);
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'source' | 'visibility'>
  ): Promise<CreatePostPresignedUrlResult> {
    return this.bucket.createPostPresignedUrl({
      ...params,
      source: S3Sources.avatar
    });
  }

  createPublicUrl(objectKey: string): string {
    return this.bucket.createPublicUrl(objectKey);
  }

  removeAvatar(objectKey: string): Promise<void> {
    return this.bucket.delete(objectKey);
  }
}

export function getS3AvatarSource() {
  return S3AvatarSource.getInstance();
}
