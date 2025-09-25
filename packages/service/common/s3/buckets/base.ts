import { Client } from 'minio';
import {
  defaultS3Options,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3BucketName,
  type S3Options
} from '../types';
import type { IBucketBasicOperations } from '../interface';
import { createObjectKey, createPresignedUrlExpires, inferContentType } from '../helpers';

export class S3BaseBucket implements IBucketBasicOperations {
  public client: Client;

  /**
   *
   * @param _bucket the bucket you want to operate
   * @param options the options for the s3 client
   * @param afterInit the function to be called after instantiating the s3 service
   */
  constructor(
    private readonly _bucket: S3BucketName,
    private readonly afterInit?: () => Promise<void> | void,
    public options: Partial<S3Options> = defaultS3Options
  ) {
    options = { ...defaultS3Options, ...options };
    this.options = options as S3Options;
    this.client = new Client(options as S3Options);

    const init = async () => {
      if (!(await this.exist())) {
        await this.client.makeBucket(this._bucket);
      }
      await this.afterInit?.();
    };
    init();
  }

  async exist(): Promise<boolean> {
    return await this.client.bucketExists(this._bucket);
  }

  get name(): string {
    return this._bucket;
  }

  upload(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  download(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  delete(objectKey: string): Promise<void> {
    return this.client.removeObject(this._bucket, objectKey);
  }

  get(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async createPostPresignedUrl(
    params: CreatePostPresignedUrlParams
  ): Promise<CreatePostPresignedUrlResult> {
    const maxFileSize = this.options.maxFileSize as number;
    const contentType = inferContentType(params.filename);

    const policy = this.client.newPostPolicy();
    policy.setBucket(this._bucket);
    policy.setContentType(contentType);
    policy.setKey(createObjectKey(params));
    policy.setContentLengthRange(1, maxFileSize);
    policy.setExpires(createPresignedUrlExpires(10));
    policy.setUserMetaData({
      filename: encodeURIComponent(params.filename),
      visibility: params.visibility
    });

    const { formData, postURL } = await this.client.presignedPostPolicy(policy);

    return {
      url: postURL,
      fields: formData
    };
  }
}
