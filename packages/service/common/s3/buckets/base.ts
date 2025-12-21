import {
  Client,
  type RemoveOptions,
  type CopyConditions,
  S3Error,
  InvalidObjectNameError,
  InvalidXMLError
} from 'minio';
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
import { addHours, addMinutes } from 'date-fns';
import { addLog } from '../../system/log';
import { addS3DelJob } from '../mq';
import { type Readable } from 'node:stream';
import { type UploadFileByBufferParams, UploadFileByBufferSchema } from '../type';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';

// Check if the error is a "file not found" type error, which should be treated as success
export const isFileNotFoundError = (error: any): boolean => {
  if (error instanceof S3Error) {
    // Handle various "not found" error codes
    return (
      error.code === 'NoSuchKey' ||
      error.code === 'InvalidObjectName' ||
      error.message === 'Not Found' ||
      error.message ===
        'The request signature we calculated does not match the signature you provided. Check your key and signing method.' ||
      error.message.includes('Resource name contains bad components') ||
      error.message.includes('Object name contains unsupported characters.')
    );
  }
  if (error instanceof InvalidObjectNameError || error instanceof InvalidXMLError) {
    return true;
  }
  return false;
};

export class S3BaseBucket {
  private _client: Client;
  private _externalClient: Client | undefined;

  /**
   *
   * @param bucketName the bucket you want to operate
   * @param options the options for the s3 client
   */
  constructor(
    public readonly bucketName: string,
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
        pathStyle: options.pathStyle,
        region: options.region
      });
    }

    const init = async () => {
      // Not exists bucket, create it
      if (!(await this.client.bucketExists(this.bucketName))) {
        await this.client.makeBucket(this.bucketName);
      }
      await this.options.afterInit?.();
      console.log(`S3 init success: ${this.bucketName}`);
    };
    if (this.options.init) {
      init();
    }
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
    await this.removeObject(from);
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
    const bucket = this.bucketName;
    if (options?.temporary) {
      await MongoS3TTL.create({
        minioKey: to,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return this.client.copyObject(bucket, to, `${bucket}/${from}`, options?.copyConditions);
  }

  async removeObject(objectKey: string, options?: RemoveOptions): Promise<void> {
    return this.client.removeObject(this.bucketName, objectKey, options).catch((err) => {
      if (isFileNotFoundError(err)) {
        return Promise.resolve();
      }
      addLog.error(`[S3 delete error]`, {
        message: err.message,
        data: { code: err.code, key: objectKey }
      });
      throw err;
    });
  }

  // 列出文件
  listObjectsV2(
    ...params: Parameters<Client['listObjectsV2']> extends [string, ...infer R] ? R : never
  ) {
    return this.client.listObjectsV2(this.bucketName, ...params);
  }

  // 上传文件
  putObject(...params: Parameters<Client['putObject']> extends [string, ...infer R] ? R : never) {
    return this.client.putObject(this.bucketName, ...params);
  }

  // 获取文件流
  getFileStream(
    ...params: Parameters<Client['getObject']> extends [string, ...infer R] ? R : never
  ) {
    return this.client.getObject(this.bucketName, ...params);
  }

  // 获取文件状态
  async statObject(
    ...params: Parameters<Client['statObject']> extends [string, ...infer R] ? R : never
  ) {
    try {
      return await this.client.statObject(this.bucketName, ...params);
    } catch (error) {
      if (error instanceof S3Error && error.message === 'Not Found') {
        return null;
      }
      return Promise.reject(error);
    }
  }

  // 判断文件是否存在
  async isObjectExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucketName, key);
      return true;
    } catch (err) {
      if (err instanceof S3Error && err.message === 'Not Found') {
        return false;
      }
      return Promise.reject(err);
    }
  }

  // 将文件流转换为Buffer
  async fileStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  addDeleteJob(params: Omit<Parameters<typeof addS3DelJob>[0], 'bucketName'>) {
    return addS3DelJob({ ...params, bucketName: this.bucketName });
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

      const key = params.rawKey;

      const policy = this.externalClient.newPostPolicy();
      policy.setKey(key);
      policy.setBucket(this.bucketName);
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
          bucketName: this.bucketName,
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

    return await this.externalClient.presignedGetObject(this.bucketName, key, expires);
  }

  async createPreviewUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.client.presignedGetObject(this.bucketName, key, expires);
  }

  async uploadFileByBuffer(params: UploadFileByBufferParams) {
    const { key, buffer, contentType } = UploadFileByBufferSchema.parse(params);

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucketName,
      expiredTime: addHours(new Date(), 1)
    });
    await this.putObject(key, buffer, undefined, {
      'Content-Type': contentType || 'application/octet-stream'
    });

    return {
      key,
      accessUrl: await this.createExternalUrl({
        key,
        expiredHours: 2
      })
    };
  }

  // 对外包装的方法
  // 获取文件元数据
  async getFileMetadata(key: string) {
    const stat = await this.statObject(key);
    if (!stat) return;

    const contentLength = stat.size;
    const filename: string = decodeURIComponent(stat.metaData['origin-filename']);
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = stat.metaData['content-type'];
    return {
      filename,
      extension,
      contentType,
      contentLength
    };
  }
}
