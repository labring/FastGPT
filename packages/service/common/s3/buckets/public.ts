import { S3BaseBucket } from './base';
import { createS3PublicBucketPolicy } from '../helpers';
import { S3Buckets } from '../constants';
import { type S3OptionsType } from '../type';

export class S3PublicBucket extends S3BaseBucket {
  constructor(options?: Partial<S3OptionsType>) {
    super(
      S3Buckets.public,
      [
        // set bucket policy
        async () => {
          const bucket = this.name;
          const policy = createS3PublicBucketPolicy(bucket);
          try {
            await this.client.setBucketPolicy(bucket, policy);
          } catch (error) {
            // NOTE: maybe it was a cloud S3 that doesn't allow us to set the policy, so that cause the error,
            // maybe we can ignore the error, or we have other plan to handle this.
            console.error('Failed to set bucket policy:', error);
          }
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

    const url = new URL(`${protocol}://${hostname}:${port}/${bucket}/${objectKey}`);

    if (this.options.externalBaseURL) {
      const externalBaseURL = new URL(this.options.externalBaseURL);

      url.port = externalBaseURL.port;
      url.hostname = externalBaseURL.hostname;
      url.protocol = externalBaseURL.protocol;
    }

    return url.toString();
  }
}
