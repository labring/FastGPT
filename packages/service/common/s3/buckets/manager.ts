import { type S3BaseBucket } from './base';
import { type S3Options } from '../types';
import { S3PublicBucket } from './public';
import { S3PrivateBucket } from './private';

export class S3BucketManager {
  private static instance: S3BucketManager;
  private publicBucket: S3PublicBucket | null = null;
  private privateBucket: S3PrivateBucket | null = null;

  private constructor() {}

  static getInstance(): S3BucketManager {
    return (this.instance ??= new S3BucketManager());
  }

  getPublicBucket(options?: Partial<S3Options>): S3PublicBucket {
    return (this.publicBucket ??= new S3PublicBucket(options));
  }

  getPrivateBucket(options?: Partial<S3Options>): S3PrivateBucket {
    return (this.privateBucket ??= new S3PrivateBucket(options));
  }
}
