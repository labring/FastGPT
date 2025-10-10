import { S3BaseBucket } from './base';
import {
  S3Buckets,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../types';

export class S3PrivateBucket extends S3BaseBucket {
  constructor(options?: Partial<S3Options>) {
    super(S3Buckets.private, undefined, options);
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'visibility'>
  ): Promise<CreatePostPresignedUrlResult> {
    return super.createPostPresignedUrl({ ...params, visibility: 'private' });
  }
}
