import { S3BaseSource } from './base';
import {
  S3Sources,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../types';
import type { S3PrivateBucket } from '../buckets/private';

class S3RawtextSource extends S3BaseSource<S3PrivateBucket> {
  constructor(options?: Partial<S3Options>) {
    super(S3Sources.rawtext, false, options);
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'source' | 'visibility'>
  ): Promise<CreatePostPresignedUrlResult> {
    return this.bucket.createPostPresignedUrl({ ...params, source: S3Sources.rawtext });
  }

  static getInstance(options?: Partial<S3Options>): S3RawtextSource {
    return S3BaseSource._getInstance(S3RawtextSource, options);
  }
}

export function getS3RawtextSource() {
  return S3RawtextSource.getInstance();
}
