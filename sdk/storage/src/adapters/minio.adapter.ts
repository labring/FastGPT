import * as Minio from 'minio';
import type { IAwsS3CompatibleStorageOptions, IStorage } from '../interface';
import type {
  UploadObjectParams,
  UploadObjectResult,
  DownloadObjectParams,
  DownloadObjectResult,
  DeleteObjectParams,
  DeleteObjectsParams,
  DeleteObjectsResult,
  PresignedPutUrlParams,
  PresignedPutUrlResult,
  ListObjectsParams,
  ListObjectsResult,
  DeleteObjectResult,
  GetObjectMetadataParams,
  GetObjectMetadataResult,
  EnsureBucketResult,
  DeleteObjectsByPrefixParams,
  StorageObjectKey,
  ExistsObjectParams,
  ExistsObjectResult,
  StorageObjectMetadata,
  PresignedGetUrlParams,
  PresignedGetUrlResult,
  CopyObjectParams,
  CopyObjectResult,
  GeneratePublicGetUrlParams,
  GeneratePublicGetUrlResult
} from '../types';
import type { Readable } from 'node:stream';
import { camelCase, kebabCase } from 'es-toolkit';
import { DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS } from '../constants';

/**
 * MinIO 存储适配器（基于 minio SDK）
 *
 * 注意：
 * - 只有 MinIO 这类 self-hosted 的存储服务会在存储桶不存在时自动创建存储桶
 */
export class MinioStorageAdapter implements IStorage {
  protected readonly client: Minio.Client;

  get bucketName(): string {
    return this.options.bucket;
  }

  constructor(protected readonly options: IAwsS3CompatibleStorageOptions) {
    if (options.vendor !== 'minio') {
      throw new Error('Invalid storage vendor: expected "minio"');
    }

    // 解析 endpoint URL
    const endpointUrl = new URL(options.endpoint);
    const useSSL = endpointUrl.protocol === 'https:';
    const port = endpointUrl.port ? parseInt(endpointUrl.port, 10) : useSSL ? 443 : 80;

    this.client = new Minio.Client({
      endPoint: endpointUrl.hostname,
      port,
      useSSL,
      accessKey: options.credentials.accessKeyId,
      secretKey: options.credentials.secretAccessKey,
      region: options.region,
      pathStyle: true // MinIO 强制使用 path style
    });
  }

  async checkObjectExists(params: ExistsObjectParams): Promise<ExistsObjectResult> {
    const { key } = params;

    let exists = false;
    try {
      await this.client.statObject(this.options.bucket, key);
      exists = true;
    } catch (error: any) {
      if (error?.code === 'NotFound' || error?.message?.includes('Not Found')) {
        exists = false;
      } else {
        throw error;
      }
    }

    return {
      key,
      exists,
      bucket: this.options.bucket
    };
  }

  async getObjectMetadata(params: GetObjectMetadataParams): Promise<GetObjectMetadataResult> {
    const { key } = params;

    const stat = await this.client.statObject(this.options.bucket, key);

    let metadata: StorageObjectMetadata = {};
    if (stat.metaData) {
      for (const [k, v] of Object.entries(stat.metaData)) {
        if (!k) continue;
        metadata[camelCase(k)] = String(v);
      }
    }

    return {
      key,
      metadata,
      etag: stat.etag,
      bucket: this.options.bucket,
      contentType: stat.metaData?.['content-type'],
      contentLength: stat.size
    };
  }

  async ensureBucket(): Promise<EnsureBucketResult> {
    const exists = await this.client.bucketExists(this.options.bucket);

    if (exists) {
      return {
        exists: true,
        created: false,
        bucket: this.options.bucket
      };
    }

    // 存储桶不存在，自动创建
    await this.client.makeBucket(this.options.bucket, this.options.region);

    return {
      exists: false,
      created: true,
      bucket: this.options.bucket
    };
  }

  async uploadObject(params: UploadObjectParams): Promise<UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;

    const metaData: Record<string, string> = {};
    if (contentType) metaData['Content-Type'] = contentType;
    if (contentDisposition) metaData['Content-Disposition'] = contentDisposition;

    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        metaData[kebabCase(k)] = String(v);
      }
    }

    await this.client.putObject(this.options.bucket, key, body, contentLength, metaData);

    return {
      key,
      bucket: this.options.bucket
    };
  }

  async downloadObject(params: DownloadObjectParams): Promise<DownloadObjectResult> {
    const { key } = params;

    const stream = await this.client.getObject(this.options.bucket, key);

    return {
      key,
      bucket: this.options.bucket,
      body: stream as Readable
    };
  }

  async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResult> {
    const { key } = params;

    await this.client.removeObject(this.options.bucket, key);

    return {
      key,
      bucket: this.options.bucket
    };
  }

  async deleteObjectsByMultiKeys(params: DeleteObjectsParams): Promise<DeleteObjectsResult> {
    const { keys } = params;

    if (keys.length === 0) {
      return {
        bucket: this.options.bucket,
        keys: []
      };
    }

    // MinIO removeObjects 接受对象数组
    await this.client.removeObjects(this.options.bucket, keys);

    // MinIO SDK 的 removeObjects 不返回失败列表，假设全部成功
    // 如果需要精确跟踪失败，需要逐个删除
    return {
      bucket: this.options.bucket,
      keys: []
    };
  }

  async deleteObjectsByPrefix(params: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult> {
    const { prefix } = params;
    const batchSize = 1000;
    const timeoutMs = 60000;

    if (!prefix?.trim()) {
      throw new Error('Prefix is required');
    }

    const bucket = this.options.bucket;
    const failedKeys: string[] = [];
    let deleteTasks: Promise<void>[] = [];

    const stream = this.client.listObjectsV2(bucket, prefix, true);

    return await new Promise<DeleteObjectsResult>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout;

      const finish = (error?: any) => {
        if (settled) return;
        settled = true;

        if (timer) clearTimeout(timer);

        stream.removeAllListeners();
        try {
          stream.destroy();
        } catch {}

        if (error) {
          reject(error);
        } else {
          resolve({ bucket, keys: failedKeys });
        }
      };

      timer = setTimeout(() => {
        finish(new Error(`Delete by prefix timeout: ${prefix}`));
      }, timeoutMs);

      const flushBatch = async (keys: string[]) => {
        if (keys.length === 0) return;

        try {
          await this.client.removeObjects(bucket, keys);
        } catch {
          failedKeys.push(...keys);
        }
      };

      let batch: string[] = [];

      stream.on('data', (obj) => {
        if (!obj.name) return;

        batch.push(obj.name);

        if (batch.length >= batchSize) {
          const toDelete = batch;
          batch = [];
          deleteTasks.push(flushBatch(toDelete));
        }
      });

      stream.on('error', (err) => {
        finish(err);
      });

      stream.on('end', async () => {
        if (timer) clearTimeout(timer);

        try {
          if (batch.length > 0) {
            deleteTasks.push(flushBatch(batch));
          }

          await Promise.all(deleteTasks);
          finish();
        } catch (e) {
          finish(e);
        }
      });

      stream.on('pause', () => {
        stream.resume();
      });
    });
  }

  async generatePresignedPutUrl(params: PresignedPutUrlParams): Promise<PresignedPutUrlResult> {
    const { key, expiredSeconds, metadata, contentType } = params;

    const expiresIn = expiredSeconds ?? DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    // 构建需要在直传时携带的 headers
    const headersToSign: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        headersToSign[`x-amz-meta-${kebabCase(k)}`] = String(v);
      }
    }

    if (contentType) {
      headersToSign['Content-Type'] = contentType;
    }

    const url = await this.client.presignedPutObject(this.options.bucket, key, expiresIn);

    return {
      key,
      url,
      bucket: this.options.bucket,
      metadata: headersToSign
    };
  }

  async generatePresignedGetUrl(params: PresignedGetUrlParams): Promise<PresignedGetUrlResult> {
    const { key, expiredSeconds } = params;

    const expiresIn = expiredSeconds ?? DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const url = await this.client.presignedGetObject(this.options.bucket, key, expiresIn);

    return {
      key,
      url,
      bucket: this.options.bucket
    };
  }

  generatePublicGetUrl(params: GeneratePublicGetUrlParams): GeneratePublicGetUrlResult {
    const { key } = params;

    // MinIO 使用 path style URL
    const url = `${this.options.endpoint}/${this.options.bucket}/${key}`;

    return {
      key,
      url,
      bucket: this.options.bucket
    };
  }

  async listObjects(params: ListObjectsParams): Promise<ListObjectsResult> {
    const { prefix } = params;
    const bucket = this.options.bucket;
    const keys: StorageObjectKey[] = [];
    const timeoutMs = 60000;

    const stream = this.client.listObjectsV2(bucket, prefix, true);

    return await new Promise<ListObjectsResult>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout;

      const finish = (error?: any) => {
        if (settled) return;
        settled = true;

        if (timer) clearTimeout(timer);

        stream.removeAllListeners();
        try {
          stream.destroy();
        } catch {}

        if (error) {
          reject(error);
        } else {
          resolve({ bucket, keys });
        }
      };

      timer = setTimeout(() => {
        finish(new Error(`List objects timeout: ${prefix}`));
      }, timeoutMs);

      stream.on('data', (obj) => {
        if (obj.name) {
          keys.push(obj.name);
        }
      });

      stream.on('error', (err) => {
        finish(err);
      });

      stream.on('end', () => {
        finish();
      });

      stream.on('pause', () => {
        stream.resume();
      });
    });
  }

  async copyObjectInSelfBucket(params: CopyObjectParams): Promise<CopyObjectResult> {
    const { sourceKey, targetKey } = params;

    const copySource = `/${this.options.bucket}/${sourceKey}`;
    await this.client.copyObject(this.options.bucket, targetKey, copySource);

    return {
      bucket: this.options.bucket,
      sourceKey,
      targetKey
    };
  }

  /**
   * 设置存储桶为公开读取策略
   */
  async ensurePublicBucketPolicy(): Promise<void> {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.options.bucket}/*`]
        }
      ]
    };

    await this.client.setBucketPolicy(this.options.bucket, JSON.stringify(policy));
  }

  /**
   * 移除存储桶的生命周期配置
   */
  async removeBucketLifecycle(): Promise<void> {
    await this.client.removeBucketLifecycle(this.options.bucket);
  }

  async destroy(): Promise<void> {
    // MinIO Client 没有显式的销毁方法，无需额外处理
  }
}
