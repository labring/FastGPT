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
  ListObjectsV2Command,
  NotFound,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { chunk } from 'es-toolkit';

export { NotFound as MinioS3NotFound };

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
   * 按前缀分页列举并删除 MinIO 对象。
   *
   * MinIO SDK 的 listObjectsV2 固定每页返回 1000 条，且其 XML 解析器默认最多展开
   * 1000 个实体。部分 S3 兼容服务会将每个 ETag 的引号编码为两个 XML 实体，
   * 导致大批量列举时误触安全上限。因此使用 AWS SDK 控制分页大小和 URL 编码，
   * 再使用 MinIO SDK 删除，以保留现有 MinIO 校验和兼容性逻辑。
   *
   * 列举和删除按页串行执行，避免对象数量较大时积累无上限的并发删除任务。
   */
  async deleteObjectsByPrefix(params: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult> {
    const { prefix } = params;
    const listBatchSize = 400;

    if (!prefix?.trim()) {
      throw new Error('Prefix is required');
    }

    const bucket = this.options.bucket;
    const failedKeys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          EncodingType: 'url',
          MaxKeys: listBatchSize
        })
      );
      const keys = (listResponse.Contents ?? []).flatMap(({ Key }) => {
        if (!Key) return [];

        // MinIO 的 encoding-type=url 响应会用 + 表示空格，需先转换再解码。
        return [decodeURIComponent(Key.replace(/\+/g, ' '))];
      });

      if (keys.length > 0) {
        await this.minioClient.removeObjects(bucket, keys).catch(() => {
          failedKeys.push(...keys);
        });
      }

      if (!listResponse.IsTruncated) break;
      if (!listResponse.NextContinuationToken) {
        throw new Error('Invalid MinIO list response: missing continuation token');
      }
      continuationToken = listResponse.NextContinuationToken;
    } while (true);

    return {
      bucket,
      keys: failedKeys
    };
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
