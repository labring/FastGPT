import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
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
import { Upload } from '@aws-sdk/lib-storage';
import { EmptyObjectError } from '../errors';
import type { Readable } from 'node:stream';
import { camelCase, chunk, isNotNil, kebabCase } from 'es-toolkit';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS } from '../constants';

export class AwsS3StorageAdapter implements IStorage {
  protected readonly client: S3Client;

  get bucketName(): string {
    return this.options.bucket;
  }

  constructor(protected readonly options: IAwsS3CompatibleStorageOptions) {
    if (options.vendor !== 'aws-s3' && options.vendor !== 'minio') {
      throw new Error('Invalid storage vendor');
    }

    this.client = new S3Client({
      region: options.region,
      credentials: options.credentials,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      maxAttempts: options.maxRetries
    });
  }

  async checkObjectExists(params: ExistsObjectParams): Promise<ExistsObjectResult> {
    const { key } = params;

    let exists = false;

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: key
        })
      );
      exists = true;
    } catch (error) {
      if (error instanceof NotFound) {
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

    const result = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: key
      })
    );

    let metadata: StorageObjectMetadata = {};
    if (result.Metadata) {
      for (const [k, v] of Object.entries(result.Metadata)) {
        if (!k) continue;
        metadata[camelCase(k)] = String(v);
      }
    }

    return {
      key,
      metadata,
      etag: result.ETag,
      bucket: this.options.bucket,
      contentType: result.ContentType,
      contentLength: result.ContentLength
    };
  }

  async ensureBucket(): Promise<EnsureBucketResult> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));

    return {
      exists: true,
      created: false,
      bucket: this.options.bucket
    };
  }

  async uploadObject(params: UploadObjectParams): Promise<UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;

    let meta: StorageObjectMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        meta[kebabCase(k)] = String(v);
      }
    }

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: contentLength,
        ContentDisposition: contentDisposition,
        Metadata: meta
      }
    });

    await upload.done();

    return {
      key,
      bucket: this.options.bucket
    };
  }

  async downloadObject(params: DownloadObjectParams): Promise<DownloadObjectResult> {
    const { key } = params;

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key
      })
    );

    if (!result.Body) {
      throw new EmptyObjectError('Object is undefined');
    }

    return {
      key,
      bucket: this.options.bucket,
      body: result.Body as Readable
    };
  }

  async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResult> {
    const { key } = params;

    await this.client.send(
      new DeleteObjectCommand({
        Key: key,
        Bucket: this.options.bucket
      })
    );

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

    const chunks = chunk(keys, 1000);
    const fails: StorageObjectKey[] = [];

    for (const chunk of chunks) {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: true
          }
        })
      );
      fails.push(...(result.Errors?.map((error) => error.Key).filter(isNotNil) ?? []));
    }

    return {
      bucket: this.options.bucket,
      keys: fails
    };
  }

  async deleteObjectsByPrefix(params: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult> {
    const { prefix } = params;
    if (!prefix) {
      throw new Error('Prefix is required');
    }

    let fails: StorageObjectKey[] = [];
    let isTruncated = false;
    let continuationToken: string | undefined = undefined;

    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000
        })
      );

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return {
          bucket: this.options.bucket,
          keys: []
        };
      }

      const objectsToDelete = listResponse.Contents.map((content) => ({ Key: content.Key }));
      const deleteResponse = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true
          }
        })
      );

      fails.push(...(deleteResponse.Errors?.map((error) => error.Key).filter(isNotNil) ?? []));

      isTruncated = listResponse.IsTruncated ?? false;
      continuationToken = listResponse.NextContinuationToken as string | undefined;
    } while (isTruncated);

    return {
      bucket: this.options.bucket,
      keys: fails
    };
  }

  async generatePresignedPutUrl(params: PresignedPutUrlParams): Promise<PresignedPutUrlResult> {
    const { key, expiredSeconds, metadata, contentType } = params;

    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    // For S3-compatible vendors, metadata is carried by `x-amz-meta-*` headers.
    // We return the expected header map so callers can do browser direct-upload with the same metadata.
    const meta: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        meta[kebabCase(k)] = String(v);
      }
    }

    if (contentType) {
      meta['Content-Type'] = contentType;
    }

    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Metadata: meta
      }),
      {
        expiresIn
      }
    );

    return {
      key,
      putUrl: url,
      bucket: this.options.bucket,
      metadata: {
        'Content-Type': meta['Content-Type']
      }
    };
  }

  async generatePresignedGetUrl(params: PresignedGetUrlParams): Promise<PresignedGetUrlResult> {
    const { key, expiredSeconds } = params;

    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key
      }),
      {
        expiresIn
      }
    );

    return {
      key,
      getUrl: url,
      bucket: this.options.bucket
    };
  }

  generatePublicGetUrl(params: GeneratePublicGetUrlParams): GeneratePublicGetUrlResult {
    const { key } = params;

    let url: string;
    if (this.options.forcePathStyle) {
      url = `${this.options.endpoint}/${this.options.bucket}/${key}`;
    } else {
      const endpoint = new URL(this.options.endpoint);
      url = `${endpoint.protocol}//${this.options.bucket}.${endpoint.host}/${key}`;
    }

    return {
      key,
      publicGetUrl: url,
      bucket: this.options.bucket
    };
  }

  async listObjects(params: ListObjectsParams): Promise<ListObjectsResult> {
    const { prefix } = params;

    let keys: StorageObjectKey[] = [];
    let isTruncated = false;
    let continuationToken: string | undefined = undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000
        })
      );

      if (!result.Contents || result.Contents.length === 0) {
        return {
          bucket: this.options.bucket,
          keys
        };
      }

      keys = keys.concat(result.Contents.map((content) => content.Key).filter(isNotNil));

      isTruncated = result.IsTruncated ?? false;
      continuationToken = result.NextContinuationToken as string | undefined;
    } while (isTruncated);

    return {
      bucket: this.options.bucket,
      keys
    };
  }

  async copyObjectInSelfBucket(params: CopyObjectParams): Promise<CopyObjectResult> {
    const { sourceKey, targetKey } = params;

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.options.bucket,
        CopySource: `${this.options.bucket}/${sourceKey}`,
        Key: targetKey
      })
    );

    return {
      bucket: this.options.bucket,
      sourceKey,
      targetKey
    };
  }

  async destroy(): Promise<void> {
    this.client.destroy();
  }
}
