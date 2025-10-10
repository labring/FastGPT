import { S3BaseSource } from './base';
import {
  S3Sources,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../type';
import type { S3PrivateBucket } from '../buckets/private';

class S3DatasetSource extends S3BaseSource<S3PrivateBucket> {
  constructor(options?: Partial<S3Options>) {
    super(S3Sources.dataset, false, options);
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'source' | 'visibility'>
  ): Promise<CreatePostPresignedUrlResult> {
    return this.bucket.createPostPresignedUrl({ ...params, source: S3Sources.dataset });
  }

  static getInstance(options?: Partial<S3Options>): S3DatasetSource {
    return S3BaseSource._getInstance(S3DatasetSource, options);
  }
}

export function getS3DatasetSource() {
  return S3DatasetSource.getInstance();
}
