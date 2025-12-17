import { S3BaseBucket } from './base';
import { S3Buckets } from '../constants';
import { type S3OptionsType } from '../type';

export class S3PublicBucket extends S3BaseBucket {
  constructor(options?: Partial<S3OptionsType>) {
    super(S3Buckets.public, {
      ...options,
      afterInit: async () => {
        const bucket = this.bucketName;
        const policy = JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${bucket}/*`
            }
          ]
        });
        try {
          await this.client.setBucketPolicy(bucket, policy);
        } catch (error) {
          // NOTE: maybe it was a cloud S3 that doesn't allow us to set the policy, so that cause the error,
          // maybe we can ignore the error, or we have other plan to handle this.
          console.error('Failed to set bucket policy:', error);
        }
      }
    });
  }

  createPublicUrl(objectKey: string): string {
    // 解析基础协议/host/端口，支持内部 endpoint 或外部暴露域名
    const protocol = this.options.useSSL ? 'https' : 'http';
    const hostname = this.options.endPoint;
    const port = this.options.port;
    const bucket = this.bucketName;

    // path style（默认） -> http(s)://endpoint/bucket/key
    // virtual host style (pathStyle=false) -> http(s)://bucket.endpoint/key
    const usePathStyle = this.options.pathStyle !== false;

    const baseUrl = this.options.externalBaseURL
      ? new URL(this.options.externalBaseURL)
      : new URL(`${protocol}://${hostname}${port ? `:${port}` : ''}`);

    // host 部分：pathStyle 用原 host；虚拟主机风格将 bucket 前缀到 host
    const hostPart = usePathStyle ? baseUrl.host : `${bucket}.${baseUrl.host}`;
    // path 部分：仅 path style 需要显式带 bucket
    const pathPrefix = usePathStyle ? `${bucket}/` : '';

    const url = new URL(`${protocol}://${hostPart}/${pathPrefix}${objectKey}`);
    url.protocol = baseUrl.protocol;
    url.port = baseUrl.port;

    return url.toString();
  }
}
