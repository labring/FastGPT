import { Client, type RemoveOptions, type CopyConditions, type LifecycleConfig } from 'minio';
import {
  type ExtensionType,
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3BucketName,
  type S3OptionsType
} from '../type';
import { defaultS3Options, Mimes } from '../constants';
import path from 'node:path';
import { MongoS3TTL } from '../schema';
import crypto from 'node:crypto';
import { UserError } from '@fastgpt/global/common/error/utils';

export class S3BaseBucket {
  private _client: Client;
  private _externalClient: Client | undefined;

  /**
   *
   * @param _bucket the bucket you want to operate
   * @param options the options for the s3 client
   */
  constructor(
    private readonly _bucket: S3BucketName,
    public options: Partial<S3OptionsType> = defaultS3Options
  ) {
    options = { ...defaultS3Options, ...options };
    this.options = options;
    this._client = new Client(options as S3OptionsType);

    if (this.options.externalBaseURL) {
      const externalBaseURL = new URL(this.options.externalBaseURL);
      const endpoint = externalBaseURL.hostname;
      const useSSL = externalBaseURL.protocol === 'https';

      this._externalClient = new Client({
        useSSL: useSSL,
        endPoint: endpoint,
        port: options.port,
        accessKey: options.accessKey,
        secretKey: options.secretKey,
        transportAgent: options.transportAgent
      });
    }

    const init = async () => {
      if (!(await this.exist())) {
        await this.client.makeBucket(this._bucket);
      }
      await this.options.afterInit?.();
    };
    init();
  }

  get name(): string {
    return this._bucket;
  }

  protected get client(): Client {
    return this._externalClient ?? this._client;
  }

  move(src: string, dst: string, options?: CopyConditions): Promise<void> {
    const bucket = this.name;
    this.client.copyObject(bucket, dst, `/${bucket}/${src}`, options);
    return this.delete(src);
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

  async createPostPresignedUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    try {
      const { expiredHours } = options;
      const ext = path.extname(params.filename).toLowerCase() as ExtensionType;
      const contentType = Mimes[ext] ?? 'application/octet-stream';
      const maxFileSize = this.options.maxFileSize as number;

      const key = (() => {
        const { rawKey, source, teamId } = params;
        if (rawKey) return rawKey;

        if (!source || !teamId) {
          throw new UserError('source and teamId are required');
        }
        return `${source}/${teamId}/${crypto.randomBytes(16).toString('hex')}`;
      })();

      const policy = this.client.newPostPolicy();
      policy.setKey(key);
      policy.setBucket(this.name);
      policy.setContentType(contentType);
      policy.setContentLengthRange(1, maxFileSize);
      policy.setExpires(new Date(Date.now() + 10 * 60 * 1000));
      policy.setUserMetaData({
        'content-type': contentType,
        'content-disposition': `attachment; filename="${encodeURIComponent(params.filename)}"`,
        'origin-filename': encodeURIComponent(params.filename),
        'upload-time': new Date().toISOString()
      });

      const { formData, postURL } = await this.client.presignedPostPolicy(policy);

      if (expiredHours) {
        await MongoS3TTL.create({
          minioKey: key,
          bucketName: this.name,
          expiredTime: new Date(Date.now() + expiredHours * 3.6e6)
        });
      }

      return {
        url: postURL,
        fields: formData
      };
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
