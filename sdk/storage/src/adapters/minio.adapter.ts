import * as Minio from 'minio';
import type { IAwsS3CompatibleStorageOptions, IStorage } from '../interface';
import type {
  DeleteObjectParams,
  DeleteObjectsParams,
  DeleteObjectsResult,
  DeleteObjectResult,
  EnsureBucketResult,
  DeleteObjectsByPrefixParams
} from '../types';
import { AwsS3StorageAdapter } from './aws-s3.adapter';
import {
  CreateBucketCommand,
  DeleteBucketLifecycleCommand,
  NotFound,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { chunk } from 'es-toolkit';

/**
 * @description MinIO 存储适配器（基于 minio SDK 和 AWS S3 SDK）
 *
 * @question 使用 `@aws-sdk/client-s3` 的 DeleteObjectCommand 删除对象时 SDK 会要求对象存储服务器返回有关对象的校验和，否则删除失败，但是 MinIO 社区版并不支持这个功能，只有云服务的 AIStor 支持。
 *
 * 因此，这里在使用 minio 作为 `vendor` 时 使用 Minio Client 的 removeObjects 方法来删除对象。
 *
 * @question 为什么不直接使用 Minio Client 来实现整个 Adapter 呢？
 *
 * 因为 Minio Client 的预签名函数不支持生成可自定义请求头的 URL，除非使用 POST Policy 来签名，否则会返回 403 错误，
 * 这里需要自定义请求头来添加对象的元数据，使用了 X-Amz-Meta-* 请求头。
 *
 * @note
 * - 只有 MinIO 这类 Self-Hosted 的对象存储服务会在存储桶不存在时自动创建存储桶。
 * - 推荐使用其他自建且兼容 S3 协议的对象存储服务使用 `aws-s3` 作为 `vendor` 来实现。
 *
 * @see https://github.com/minio/minio/issues/20845
 * @see https://github.com/aws/aws-sdk-net/issues/3641
 */
export class MinioStorageAdapter extends AwsS3StorageAdapter implements IStorage {
  protected readonly minioClient: Minio.Client;

  constructor(protected readonly options: IAwsS3CompatibleStorageOptions) {
    if (options.vendor !== 'minio') {
      throw new Error('Invalid storage vendor: expected "minio"');
    }

    // NOTE:
    // Maybe some self-hosted MinIO services don't support path style access,
    // options.forcePathStyle = true;
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
      pathStyle: options.forcePathStyle
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

    // 每次 removeObjects 最多删除 1000 个对象
    // 因此需要将对象列表分块
    const chunks = chunk(keys, 1000);

    for (const chunk of chunks) {
      await this.minioClient.removeObjects(this.options.bucket, chunk);
    }

    // Minio Client 的 removeObjects 不返回失败列表，假设全部成功
    return {
      bucket: this.options.bucket,
      keys: []
    };
  }

  /**
   * @note 这里的实现可以使用 `@aws-sdk/client-s3` 来列出对象，然后使用 `minio` 来删除对象，但是这里直接使用 `minio` 的 `listObjectsV2` 方法来列出对象了。
   */
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
