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
import { AwsS3StorageAdapter } from './aws-s3.adapter';
import {
  CreateBucketCommand,
  DeleteBucketLifecycleCommand,
  NotFound,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3';

/**
 * MinIO 存储适配器（基于 minio SDK）
 *
 * 注意：
 * - 只有 MinIO 这类 self-hosted 的存储服务会在存储桶不存在时自动创建存储桶
 */
export class MinioStorageAdapter extends AwsS3StorageAdapter implements IStorage {
  protected readonly minioClient: Minio.Client;

  get bucketName(): string {
    return this.options.bucket;
  }

  constructor(protected readonly options: IAwsS3CompatibleStorageOptions) {
    if (options.vendor !== 'minio') {
      throw new Error('Invalid storage vendor: expected "minio"');
    }

    options.forcePathStyle = true;
    super(options);

    // 解析 endpoint URL
    const endpointUrl = new URL(options.endpoint);
    const useSSL = endpointUrl.protocol === 'https:';
    const port = endpointUrl.port ? parseInt(endpointUrl.port, 10) : useSSL ? 443 : 80;

    this.minioClient = new Minio.Client({
      endPoint: endpointUrl.hostname,
      port,
      useSSL,
      accessKey: options.credentials.accessKeyId,
      secretKey: options.credentials.secretAccessKey,
      region: options.region,
      pathStyle: true // MinIO 强制使用 path style
    });
  }

  async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResult> {
    const { key } = params;

    await this.minioClient.removeObject(this.options.bucket, key);

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
    await this.minioClient.removeObjects(this.options.bucket, keys);

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

    const stream = this.minioClient.listObjectsV2(bucket, prefix, true);

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
          await this.minioClient.removeObjects(bucket, keys);
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

  async ensureBucket(): Promise<EnsureBucketResult> {
    try {
      return await super.ensureBucket();
    } catch (error) {
      if (!(error instanceof NotFound)) {
        throw error;
      }

      await this.client.send(new CreateBucketCommand({ Bucket: this.options.bucket }));

      return {
        exists: false,
        created: true,
        bucket: this.options.bucket
      };
    }
  }

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

    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.options.bucket,
        Policy: JSON.stringify(policy)
      })
    );
  }

  async removeBucketLifecycle(): Promise<void> {
    await this.client.send(new DeleteBucketLifecycleCommand({ Bucket: this.options.bucket }));
  }
}
