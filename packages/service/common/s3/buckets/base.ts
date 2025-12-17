import { S3Error } from 'minio';
import {
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type createPreviewUrlParams,
  CreateGetPresignedUrlParamsSchema
} from '../type';
import { getSystemMaxFileSize, Mimes } from '../constants';
import path from 'node:path';
import { MongoS3TTL } from '../schema';
import { addHours, addMinutes, differenceInSeconds } from 'date-fns';
import { addLog } from '../../system/log';
import { addS3DelJob } from '../mq';
import { type UploadFileByBufferParams, UploadFileByBufferSchema } from '../type';
import { type IStorage } from '@fastgpt-sdk/storage';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';

export class S3BaseBucket {
  constructor(
    private readonly _client: IStorage,
    private readonly _externalClient: IStorage | undefined
  ) {}

  get client(): IStorage {
    return this._client;
  }

  get externalClient(): IStorage {
    return this._externalClient ?? this._client;
  }

  get bucketName(): string {
    return this.client.bucketName;
  }

  // TODO: 加到 MQ 里保障幂等
  async move({ from, to }: { from: string; to: string }): Promise<void> {
    await this.copy({ from, to, options: { temporary: false } });
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
    };
  }) {
    if (options?.temporary) {
      await MongoS3TTL.create({
        minioKey: to,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return this.client.copyObjectInSelfBucket({ sourceKey: from, targetKey: to });
  }

  async delete(objectKey: string) {
    try {
      if (!objectKey) return Promise.resolve();

      // 把连带的 parsed 数据一起删除
      const fileParsedPrefix = `${path.dirname(objectKey)}/${path.basename(objectKey, path.extname(objectKey))}-parsed`;
      await this.addDeleteJob({ prefix: fileParsedPrefix });

      return await this.client.deleteObject({ key: objectKey });
    } catch (error) {
      if (error instanceof S3Error) {
        if (error.code === 'InvalidObjectName') {
          addLog.warn(`${this.bucketName} delete object not found: ${objectKey}`, error);
          return Promise.resolve();
        }
      }
      return Promise.reject(error);
    }
  }

  addDeleteJob(params: Omit<Parameters<typeof addS3DelJob>[0], 'bucketName'>) {
    return addS3DelJob({ ...params, bucketName: this.bucketName });
  }

  async isObjectExists(key: string) {
    const { exists } = await this.client.checkObjectExists({ key });

    return exists ?? false;
  }

  async createPresignedPutUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    try {
      const { expiredHours, maxFileSize = getSystemMaxFileSize() } = options;
      const formatMaxFileSize = maxFileSize * 1024 * 1024;
      const filename = params.filename;
      const ext = path.extname(filename).toLowerCase();
      const contentType = Mimes[ext as keyof typeof Mimes] ?? 'application/octet-stream';
      const expiredSeconds = differenceInSeconds(addMinutes(new Date(), 10), new Date());

      const { metadata, putUrl } = await this.externalClient.generatePresignedPutUrl({
        key: params.rawKey,
        expiredSeconds,
        contentType,
        metadata: {
          contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
          originFilename: encodeURIComponent(filename),
          uploadTime: new Date().toISOString(),
          ...params.metadata
        }
      });

      if (expiredHours) {
        await MongoS3TTL.create({
          minioKey: params.rawKey,
          bucketName: this.bucketName,
          expiredTime: addHours(new Date(), expiredHours)
        });
      }

      return {
        url: putUrl,
        fields: {
          ...metadata,
          key: params.rawKey
        },
        maxSize: formatMaxFileSize
      };
    } catch (error) {
      addLog.error('Failed to create presigned put url', error);
      return Promise.reject('Failed to create presigned put url');
    }
  }

  async createExternalUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.externalClient.generatePresignedGetUrl({ key, expiredSeconds: expires });
  }

  async createPreviewUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.client.generatePresignedGetUrl({ key, expiredSeconds: expires });
  }

  async uploadFileByBuffer(params: UploadFileByBufferParams) {
    const { key, buffer, contentType } = UploadFileByBufferSchema.parse(params);

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucketName,
      expiredTime: addHours(new Date(), 1)
    });

    await this.client.uploadObject({
      key,
      body: buffer,
      contentType: contentType || 'application/octet-stream'
    });

    return {
      key,
      accessUrl: await this.createExternalUrl({
        key,
        expiredHours: 2
      })
    };
  }

  async getFileMetadata(key: string) {
    const metadataResponse = await this.client.getObjectMetadata({ key });
    if (!metadataResponse) return;

    const contentLength = metadataResponse.contentLength;
    const filename: string = decodeURIComponent(metadataResponse.metadata.originFilename || '');
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = metadataResponse.contentType || 'application/octet-stream';

    return {
      filename,
      extension,
      contentType,
      contentLength
    };
  }

  async getFileStream(key: string) {
    const downloadResponse = await this.client.downloadObject({ key });
    if (!downloadResponse) return;

    return downloadResponse.body;
  }
}
