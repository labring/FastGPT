import { Client, type RemoveOptions, type CopyConditions, S3Error } from 'minio';
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
import { addHours, addMinutes } from 'date-fns';
import { addLog } from '../../system/log';
import { addS3DelJob } from '../mq';
import { type Readable } from 'node:stream';

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

  // TODO: 加到 MQ 里保障幂等
  async move({
    from,
    to,
    options
  }: {
    from: string;
    to: string;
    options?: CopyConditions;
  }): Promise<void> {
    await this.copy({
      from,
      to,
      options: {
        copyConditions: options,
        temporary: false
      }
    });
    await this.delete(from);
  }

  async copy({
    from,
    to,
    options
  }: {
    from: string;
    to: string;
    options?: {
      temporary?: boolean;
      copyConditions?: CopyConditions;
    };
  }): ReturnType<Client['copyObject']> {
    const bucket = this.name;
    if (options?.temporary) {
      await MongoS3TTL.create({
        minioKey: to,
        bucketName: this.name,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return this.client.copyObject(bucket, to, `${bucket}/${from}`, options?.copyConditions);
  }

  exist(): Promise<boolean> {
    return this.client.bucketExists(this.name);
  }

  async delete(objectKey: string, options?: RemoveOptions): Promise<void> {
    try {
      if (!objectKey) return Promise.resolve();

      // 把连带的 parsed 数据一起删除
      const fileParsedPrefix = `${path.dirname(objectKey)}/${path.basename(objectKey, path.extname(objectKey))}-parsed`;
      await this.addDeleteJob({ prefix: fileParsedPrefix });

      return await this.client.removeObject(this.name, objectKey, options);
    } catch (error) {
      if (error instanceof S3Error) {
        if (error.code === 'InvalidObjectName') {
          addLog.warn(`${this.name} delete object not found: ${objectKey}`, error);
          return Promise.resolve();
        }
      }
      return Promise.reject(error);
    }
  }

  listObjectsV2(
    ...params: Parameters<Client['listObjectsV2']> extends [string, ...infer R] ? R : never
  ) {
    return this.client.listObjectsV2(this.name, ...params);
  }

  putObject(...params: Parameters<Client['putObject']> extends [string, ...infer R] ? R : never) {
    return this.client.putObject(this.name, ...params);
  }

  getObject(...params: Parameters<Client['getObject']> extends [string, ...infer R] ? R : never) {
    return this.client.getObject(this.name, ...params);
  }

  statObject(...params: Parameters<Client['statObject']> extends [string, ...infer R] ? R : never) {
    return this.client.statObject(this.name, ...params);
  }

  async fileStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  addDeleteJob(params: Omit<Parameters<typeof addS3DelJob>[0], 'bucketName'>) {
    return addS3DelJob({ ...params, bucketName: this.name });
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
        return [params.source, params.teamId, `${getNanoid(6)}-${filename}`].join('/');
      })();

      const policy = this.externalClient.newPostPolicy();
      policy.setKey(key);
      policy.setBucket(this.name);
      policy.setContentType(contentType);
      if (formatMaxFileSize) {
        policy.setContentLengthRange(1, formatMaxFileSize);
      }
      policy.setExpires(addMinutes(new Date(), 10));
      policy.setUserMetaData({
        'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'origin-filename': encodeURIComponent(filename),
        'upload-time': new Date().toISOString(),
        ...params.metadata
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

  async createExternalUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.externalClient.presignedGetObject(this.name, key, expires, {
      'Content-Disposition': `attachment; filename="${path.basename(key)}"`
    });
  }

  async createPreviewUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.client.presignedGetObject(this.name, key, expires, {
      'Content-Disposition': `attachment; filename="${path.basename(key)}"`
    });
  }
}
