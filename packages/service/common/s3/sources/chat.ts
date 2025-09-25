import { S3BaseSource } from './base';
import {
  S3Sources,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../types';
import type { S3PrivateBucket } from '../buckets/private';

class S3ChatSource extends S3BaseSource<S3PrivateBucket> {
  constructor(options?: Partial<S3Options>) {
    super(S3Sources.chat, false, options);
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'source' | 'visibility'>
  ): Promise<CreatePostPresignedUrlResult> {
    return this.bucket.createPostPresignedUrl({ ...params, source: S3Sources.chat });
  }

  static getInstance(options?: Partial<S3Options>): S3ChatSource {
    return S3BaseSource._getInstance(S3ChatSource, options);
  }
}

export function getS3ChatSource() {
  return S3ChatSource.getInstance();
}
