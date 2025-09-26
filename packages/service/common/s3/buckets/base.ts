import { Client, type RemoveOptions, type CopyConditions, type LifecycleConfig } from 'minio';
import {
  defaultS3Options,
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3BucketName,
  type S3Options
} from '../types';
import type { IBucketBasicOperations } from '../interface';
import {
  createObjectKey,
  createPresignedUrlExpires,
  createTempObjectKey,
  inferContentType
} from '../helpers';

export class S3BaseBucket implements IBucketBasicOperations {
  public client: Client;

  /**
   *
   * @param _bucket the bucket you want to operate
   * @param options the options for the s3 client
   * @param afterInits the function to be called after instantiating the s3 service
   */
  constructor(
    private readonly _bucket: S3BucketName,
    private readonly afterInits?: (() => Promise<void> | void)[],
    public options: Partial<S3Options> = defaultS3Options
  ) {
    options = { ...defaultS3Options, ...options };
    this.options = options as S3Options;
    this.client = new Client(options as S3Options);

    const init = async () => {
      if (!(await this.exist())) {
        await this.client.makeBucket(this._bucket);
      }
      await Promise.all(this.afterInits?.map((afterInit) => afterInit()) ?? []);
    };
    init();
  }

  get name(): string {
    return this._bucket;
  }

  async move(src: string, dst: string, options?: CopyConditions): Promise<void> {
    const bucket = this.name;
    await this.client.copyObject(bucket, dst, `/${bucket}/${src}`, options);
    return this.client.removeObject(bucket, src);
  }

  copy(src: string, dst: string, options?: CopyConditions): ReturnType<Client['copyObject']> {
    return this.client.copyObject(this.name, src, dst, options);
  }

  exist(): Promise<boolean> {
    return this.client.bucketExists(this.name);
  }

  delete(objectKey: string, options?: RemoveOptions): Promise<void> {
    return this.client.removeObject(this.name, objectKey, options);
  }

  get(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  lifecycle(): Promise<LifecycleConfig | null> {
    return this.client.getBucketLifecycle(this.name);
  }

  async createPostPresignedUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    const { temporay } = options;
    const contentType = inferContentType(params.filename);
    const maxFileSize = this.options.maxFileSize as number;
    const key = temporay ? createTempObjectKey(params) : createObjectKey(params);

    const policy = this.client.newPostPolicy();
    policy.setKey(key);
    policy.setBucket(this.name);
    policy.setContentType(contentType);
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
