import { S3BucketManager } from '../buckets/manager';
import type { S3PrivateBucket } from '../buckets/private';
import type { S3PublicBucket } from '../buckets/public';
import type {
  CreatePostPresignedUrlParams,
  CreatePostPresignedUrlResult,
  S3Options,
  S3SourceType
} from '../type';

type Bucket = S3PublicBucket | S3PrivateBucket;

export abstract class S3BaseSource<T extends Bucket = Bucket> {
  protected bucket: T;
  protected static instances: Map<string, S3BaseSource> = new Map();

  constructor(
    protected readonly source: S3SourceType,
    protected readonly pub: boolean = false,
    options?: Partial<S3Options>
  ) {
    const manager = S3BucketManager.getInstance();
    switch (pub) {
      case true:
        this.bucket = manager.getPublicBucket(options) as T;
        break;
      case false:
        this.bucket = manager.getPrivateBucket(options) as T;
    }
  }

  abstract createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'source' | 'visibility'>
  ): Promise<CreatePostPresignedUrlResult>;

  protected static _getInstance<T extends S3BaseSource>(
    constructor: new (options?: Partial<S3Options>) => T,
    options?: Partial<S3Options>
  ): T {
    const className = constructor.name;
    if (!S3BaseSource.instances.has(className)) {
      S3BaseSource.instances.set(className, new constructor(options));
    }
    return S3BaseSource.instances.get(className) as T;
  }

  protected getBucket(): T {
    return this.bucket;
  }

  get bucketName(): string {
    return this.bucket.name;
  }

  isBucketExist(): Promise<boolean> {
    return this.bucket.exist();
  }
}
