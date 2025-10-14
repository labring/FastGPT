import { S3BaseBucket } from './base';
import { S3Buckets } from '../constants';
import { type S3OptionsType } from '../type';

export class S3PrivateBucket extends S3BaseBucket {
  constructor(options?: Partial<S3OptionsType>) {
    super(S3Buckets.private, options);
  }
}
