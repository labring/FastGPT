import { Client, type RemoveOptions, type CopyConditions } from 'minio';
import {
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3OptionsType
} from '../type';
import { defaultS3Options, Mimes } from '../constants';
import path from 'node:path';
import { MongoS3TTL } from '../schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addHours } from 'date-fns';
import { addLog } from '../../system/log';

export class S3BaseBucket {
  private _client: Client;
  private _externalClient: Client | undefined;

  /**
   *
   * @param bucketName the bucket you want to operate
   * @param options the options for the s3 client
   */
  constructor(
    private readonly bucketName: string,
    public options: Partial<S3OptionsType> = defaultS3Options
  ) {
    options = { ...defaultS3Options, ...options };
    this.options = options;
    this._client = new Client(options as S3OptionsType);

    if (this.options.externalBaseURL) {
      const externalBaseURL = new URL(this.options.externalBaseURL);
      const endpoint = externalBaseURL.hostname;
      const useSSL = externalBaseURL.protocol === 'https:';

      const externalPort = externalBaseURL.port
        ? parseInt(externalBaseURL.port)
        : useSSL
          ? 443
          : undefined; // https 默认 443，其他情况让 MinIO 客户端使用默认端口

      this._externalClient = new Client({
        useSSL: useSSL,
        endPoint: endpoint,
        port: externalPort,
        accessKey: options.accessKey,
        secretKey: options.secretKey,
        transportAgent: options.transportAgent
      });
    }

    const init = async () => {
      if (!(await this.exist())) {
        await this.client.makeBucket(this.bucketName);
      }
      await this.options.afterInit?.();
      console.log(`S3 init success: ${this.name}`);
    };
    init();
  }

  get name(): string {
    return this.bucketName;
  }
  get client(): Client {
    return this._client;
  }
  get externalClient(): Client {
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
      const filename = params.filename;
      const ext = path.extname(filename).toLowerCase();
      const contentType = Mimes[ext as keyof typeof Mimes] ?? 'application/octet-stream';
      const maxFileSize = this.options.maxFileSize;

      const key = (() => {
        if ('rawKey' in params) return params.rawKey;

        return `${params.source}/${params.teamId}/${getNanoid(6)}-${filename}`;
      })();

      const policy = this.externalClient.newPostPolicy();
      policy.setKey(key);
      policy.setBucket(this.name);
      policy.setContentType(contentType);
      if (maxFileSize) {
        policy.setContentLengthRange(1, maxFileSize);
      }
      policy.setExpires(new Date(Date.now() + 10 * 60 * 1000));
      policy.setUserMetaData({
        'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'origin-filename': encodeURIComponent(filename),
        'upload-time': new Date().toISOString()
      });

      const { formData, postURL } = await this.externalClient.presignedPostPolicy(policy);

      if (expiredHours) {
        await MongoS3TTL.create({
          minioKey: key,
          bucketName: this.name,
          expiredTime: addHours(new Date(), expiredHours)
        });
      }

      return {
        url: postURL,
        fields: formData
      };
    } catch (error) {
      addLog.error('Failed to create post presigned url', error);
      return Promise.reject('Failed to create post presigned url');
    }
  }
}
