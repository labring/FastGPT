import { Client, type RemoveOptions, type CopyConditions, InvalidObjectNameError } from 'minio';
import {
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3OptionsType,
  type createPreviewUrlParams,
  CreateGetPresignedUrlParamsSchema
} from '../type';
import { defaultS3Options, getSystemMaxFileSize, Mimes } from '../constants';
import path from 'node:path';
import { MongoS3TTL } from '../schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addHours } from 'date-fns';
import { addLog } from '../../system/log';
import { addS3DelJob } from '../mq';

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

  async copy({
    src,
    dst,
    ttl,
    options
  }: {
    src: string;
    dst: string;
    ttl: boolean;
    options?: CopyConditions;
  }): ReturnType<Client['copyObject']> {
    if (ttl) {
      await MongoS3TTL.create({
        minioKey: dst,
        bucketName: this.name,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return this.client.copyObject(this.name, src, dst, options);
  }

  exist(): Promise<boolean> {
    return this.client.bucketExists(this.name);
  }

  async delete(objectKey: string, options?: RemoveOptions): Promise<void> {
    try {
      if (!objectKey) return Promise.resolve();
      return await this.client.removeObject(this.name, objectKey, options);
    } catch (error) {
      if (error instanceof InvalidObjectNameError) {
        addLog.warn(`${this.name} delete object not found: ${objectKey}`, error);
        return Promise.resolve();
      }
      return Promise.reject(error);
    }
  }

  addDeleteJob({ prefix, key }: { prefix?: string; key?: string }): Promise<void> {
    return addS3DelJob({ prefix, key, bucketName: this.name });
  }

  listObjectsV2(
    ...params: Parameters<Client['listObjectsV2']> extends [string, ...infer R] ? R : never
  ) {
    return this.client.listObjectsV2(this.name, ...params);
  }

  async createPostPresignedUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    try {
      const { expiredHours, maxFileSize = getSystemMaxFileSize() } = options;
      const formatMaxFileSize = maxFileSize * 1024 * 1024;
      const filename = params.filename;
      const ext = path.extname(filename).toLowerCase();
      const contentType = Mimes[ext as keyof typeof Mimes] ?? 'application/octet-stream';

      const key = (() => {
        if ('rawKey' in params) return params.rawKey;

        return `${params.source}/${params.teamId}/${getNanoid(6)}-${filename}`;
      })();

      const policy = this.externalClient.newPostPolicy();
      policy.setKey(key);
      policy.setBucket(this.name);
      policy.setContentType(contentType);
      if (formatMaxFileSize) {
        policy.setContentLengthRange(1, formatMaxFileSize);
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
        fields: formData,
        maxSize: formatMaxFileSize
      };
    } catch (error) {
      addLog.error('Failed to create post presigned url', error);
      return Promise.reject('Failed to create post presigned url');
    }
  }

  async createExtenalUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.externalClient.presignedGetObject(this.name, key, expires);
  }
  async createPreviewlUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.client.presignedGetObject(this.name, key, expires);
  }
}
