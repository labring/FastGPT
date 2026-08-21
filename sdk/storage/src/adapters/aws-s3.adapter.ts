import AWS from '@aws-sdk/client-s3';
import type { IAwsS3CompatibleStorageOptions, IStorage } from '../interface';
import type * as Storage from '../types';
import { Upload } from '@aws-sdk/lib-storage';
import { EmptyObjectError } from '../errors';
import type { Readable } from 'node:stream';
import { camelCase, chunk, isNotNil, kebabCase, trim } from 'es-toolkit';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AWS_S3_COMPATIBLE_VENDORS, DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS } from '../constants';
import {
  bindAbortSignalToReadable,
  encodeObjectKeyPath,
  throwIfStorageDownloadAborted
} from '../utils';
import {
  assertStorageObjectKey,
  assertStorageObjectKeys,
  assertStorageObjectPrefix,
  assertRequiredStorageObjectPrefix,
  assertMultipartContentLength,
  assertMultipartPartNumber,
  assertMultipartUploadId,
  assertMultipartUploadParts,
  isNoSuchMultipartUploadError
} from '../assert';

function toAwsMetadata(metadata?: Storage.StorageObjectMetadata): Storage.StorageObjectMetadata {
  const meta: Storage.StorageObjectMetadata = {};
  if (!metadata) return meta;

  for (const [key, value] of Object.entries(metadata)) {
    if (!key) continue;
    meta[kebabCase(key)] = String(value);
  }
  return meta;
}

export class AwsS3StorageAdapter implements IStorage {
  protected readonly client: AWS.S3Client;

  get bucketName(): string {
    return this.options.bucket;
  }

  constructor(protected readonly options: IAwsS3CompatibleStorageOptions) {
    if (!AWS_S3_COMPATIBLE_VENDORS.includes(options.vendor)) {
      throw new Error(`Invalid storage vendor: expected ${AWS_S3_COMPATIBLE_VENDORS.toString()}`);
    }

    const r2SpecifiedOptions = {
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
    } satisfies ConstructorParameters<typeof AWS.S3Client>[0];

    this.client = new AWS.S3Client({
      region: options.region,
      credentials: options.credentials,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      maxAttempts: options.maxRetries,

      ...(options.vendor === 'r2' ? r2SpecifiedOptions : undefined)
    });
  }

  async checkObjectExists(params: Storage.ExistsObjectParams): Promise<Storage.ExistsObjectResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    let exists = false;

    try {
      await this.client.send(
        new AWS.HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: key
        })
      );
      exists = true;
    } catch (error) {
      if (error instanceof AWS.NotFound) {
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

  async getObjectMetadata(
    params: Storage.GetObjectMetadataParams
  ): Promise<Storage.GetObjectMetadataResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    const result = await this.client.send(
      new AWS.HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: key
      })
    );

    const metadata: Storage.StorageObjectMetadata = {};
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

  async ensureBucket(): Promise<Storage.EnsureBucketResult> {
    await this.client.send(new AWS.HeadBucketCommand({ Bucket: this.options.bucket }));

    return {
      exists: true,
      created: false,
      bucket: this.options.bucket
    };
  }

  async uploadObject(params: Storage.UploadObjectParams): Promise<Storage.UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;
    assertStorageObjectKey(key);

    const meta = toAwsMetadata(metadata);

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

  async createMultipartUpload(
    params: Storage.CreateMultipartUploadParams
  ): Promise<Storage.CreateMultipartUploadResult> {
    const { key, contentType, contentDisposition, metadata } = params;
    assertStorageObjectKey(key);

    const result = await this.client.send(
      new AWS.CreateMultipartUploadCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: contentType,
        ContentDisposition: contentDisposition,
        Metadata: toAwsMetadata(metadata)
      })
    );

    if (!result.UploadId) {
      throw new Error('Multipart upload initialization did not return an uploadId');
    }

    return {
      bucket: this.options.bucket,
      key,
      uploadId: result.UploadId
    };
  }

  async uploadMultipartPart(
    params: Storage.UploadMultipartPartParams
  ): Promise<Storage.UploadMultipartPartResult> {
    const { key, uploadId, partNumber, body, contentLength } = params;
    assertStorageObjectKey(key);
    assertMultipartUploadId(uploadId);
    assertMultipartPartNumber(partNumber);
    assertMultipartContentLength(contentLength);

    const result = await this.client.send(
      new AWS.UploadPartCommand({
        Bucket: this.options.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: contentLength
      })
    );

    if (!result.ETag) {
      throw new Error('Multipart part upload did not return an ETag');
    }

    return {
      bucket: this.options.bucket,
      key,
      uploadId,
      partNumber,
      etag: result.ETag
    };
  }

  async completeMultipartUpload(
    params: Storage.CompleteMultipartUploadParams
  ): Promise<Storage.CompleteMultipartUploadResult> {
    const { key, uploadId, parts } = params;
    assertStorageObjectKey(key);
    assertMultipartUploadId(uploadId);
    assertMultipartUploadParts(parts);

    await this.client.send(
      new AWS.CompleteMultipartUploadCommand({
        Bucket: this.options.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map(({ partNumber, etag }) => ({
            PartNumber: partNumber,
            ETag: etag
          }))
        }
      })
    );

    return {
      bucket: this.options.bucket,
      key
    };
  }

  async abortMultipartUpload(
    params: Storage.AbortMultipartUploadParams
  ): Promise<Storage.AbortMultipartUploadResult> {
    const { key, uploadId } = params;
    assertStorageObjectKey(key);
    assertMultipartUploadId(uploadId);

    try {
      await this.client.send(
        new AWS.AbortMultipartUploadCommand({
          Bucket: this.options.bucket,
          Key: key,
          UploadId: uploadId
        })
      );
    } catch (error) {
      if (!isNoSuchMultipartUploadError(error)) throw error;
    }

    return {
      bucket: this.options.bucket,
      key,
      uploadId
    };
  }

  async downloadObject(
    params: Storage.DownloadObjectParams
  ): Promise<Storage.DownloadObjectResult> {
    const { key, abortSignal } = params;
    assertStorageObjectKey(key);
    throwIfStorageDownloadAborted(abortSignal);

    const result = await this.client.send(
      new AWS.GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key
      }),
      { abortSignal }
    );

    if (!result.Body) {
      throw new EmptyObjectError('Object is undefined');
    }
    const body = result.Body as Readable;
    bindAbortSignalToReadable({ readable: body, abortSignal });

    return {
      key,
      bucket: this.options.bucket,
      body
    };
  }

  async deleteObject(params: Storage.DeleteObjectParams): Promise<Storage.DeleteObjectResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    await this.client.send(
      new AWS.DeleteObjectCommand({
        Key: key,
        Bucket: this.options.bucket
      })
    );

    return {
      key,
      bucket: this.options.bucket
    };
  }

  async deleteObjectsByMultiKeys(
    params: Storage.DeleteObjectsParams
  ): Promise<Storage.DeleteObjectsResult> {
    assertStorageObjectKeys(params.keys);
    return this.deleteObjectsByRawKeys(params);
  }

  /** legacy 原始 key 直删：跳过格式断言，仅保留分块与失败 key 上报。 */
  async deleteObjectsByRawKeys(
    params: Storage.DeleteObjectsParams
  ): Promise<Storage.DeleteObjectsResult> {
    const { keys } = params;
    if (keys.length === 0) {
      return {
        bucket: this.options.bucket,
        keys: []
      };
    }

    const chunks = chunk(keys, 1000);
    const fails: Storage.StorageObjectKey[] = [];

    for (const chunk of chunks) {
      const result = await this.client.send(
        new AWS.DeleteObjectsCommand({
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

  async deleteObjectsByPrefix(
    params: Storage.DeleteObjectsByPrefixParams
  ): Promise<Storage.DeleteObjectsResult> {
    const { prefix } = params;
    assertRequiredStorageObjectPrefix(prefix);

    const fails: Storage.StorageObjectKey[] = [];
    let isTruncated = false;
    let continuationToken: string | undefined = undefined;

    do {
      const listResponse = await this.client.send(
        new AWS.ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000
        })
      );

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return {
          bucket: this.options.bucket,
          keys: fails
        };
      }

      const objectsToDelete = listResponse.Contents.map((content) => ({ Key: content.Key }));
      const deleteResponse = await this.client.send(
        new AWS.DeleteObjectsCommand({
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

  async generatePresignedPutUrl(
    params: Storage.PresignedPutUrlParams
  ): Promise<Storage.PresignedPutUrlResult> {
    const { key, expiredSeconds, metadata, contentType } = params;
    assertStorageObjectKey(key);

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

    const convertToS3Headers = (meta: Record<string, string>) => {
      return Object.keys(meta)
        .filter((key) => key !== 'Content-Type')
        .map((key) => `x-amz-meta-${key}`);
    };

    const url = await getSignedUrl(
      this.client,
      new AWS.PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Metadata: meta,
        ContentType: contentType
      }),
      {
        expiresIn,
        unhoistableHeaders: new Set(convertToS3Headers(meta))
      }
    );

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (key.toLowerCase() === 'content-type') {
        continue;
      }
      headers[`x-amz-meta-${key}`] = value;
    }
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    return {
      key,
      url: url,
      bucket: this.options.bucket,
      metadata: headers
    };
  }

  async generatePresignedGetUrl(
    params: Storage.PresignedGetUrlParams
  ): Promise<Storage.PresignedGetUrlResult> {
    const { key, expiredSeconds, responseContentType } = params;
    assertStorageObjectKey(key);

    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const url = await getSignedUrl(
      this.client,
      new AWS.GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ResponseContentType: responseContentType
      }),
      {
        expiresIn
      }
    );

    return {
      key,
      url: url,
      bucket: this.options.bucket
    };
  }

  generatePublicGetUrl(
    params: Storage.GeneratePublicGetUrlParams
  ): Storage.GeneratePublicGetUrlResult {
    const { key } = params;
    assertStorageObjectKey(key);
    const encodedKey = encodeObjectKeyPath(key);

    let url: string;
    if (this.options.publicEndpoint) {
      const endpoint = new URL(this.options.publicEndpoint);
      if (endpoint.search || endpoint.hash) {
        throw new Error('publicEndpoint must not contain query or hash');
      }
      url = `${endpoint.toString().replace(/\/+$/, '')}/${encodedKey}`;
    } else if (this.options.forcePathStyle) {
      if (this.options.publicAccessExtraSubPath) {
        url = `${this.options.endpoint}/${trim(this.options.publicAccessExtraSubPath, '/')}/${this.options.bucket}/${encodedKey}`;
      } else {
        url = `${this.options.endpoint}/${this.options.bucket}/${encodedKey}`;
      }
    } else {
      const endpoint = new URL(this.options.endpoint);
      const protocol = endpoint.protocol;
      const host = endpoint.host;

      if (this.options.publicAccessExtraSubPath) {
        url = `${protocol}//${this.options.bucket}.${host}/${trim(this.options.publicAccessExtraSubPath, '/')}/${encodedKey}`;
      } else {
        url = `${protocol}//${this.options.bucket}.${host}/${encodedKey}`;
      }
    }

    return {
      key,
      url: url,
      bucket: this.options.bucket
    };
  }

  async listObjects(params: Storage.ListObjectsParams): Promise<Storage.ListObjectsResult> {
    const { prefix } = params;
    assertStorageObjectPrefix(prefix);

    let keys: Storage.StorageObjectKey[] = [];
    let isTruncated = false;
    let continuationToken: string | undefined = undefined;

    do {
      const result = await this.client.send(
        new AWS.ListObjectsV2Command({
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

  async copyObjectInSelfBucket(
    params: Storage.CopyObjectParams
  ): Promise<Storage.CopyObjectResult> {
    const { sourceKey, targetKey } = params;
    assertStorageObjectKey(sourceKey, 'sourceKey');
    assertStorageObjectKey(targetKey, 'targetKey');

    const encodedSourceKey = sourceKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    await this.client.send(
      new AWS.CopyObjectCommand({
        Bucket: this.options.bucket,
        CopySource: `${this.options.bucket}/${encodedSourceKey}`,
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
