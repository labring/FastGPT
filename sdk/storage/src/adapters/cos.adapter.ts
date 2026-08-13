import COS from 'cos-nodejs-sdk-v5';
import type { ICosStorageOptions, IStorage } from '../interface';
import type * as Storage from '../types';
import { PassThrough } from 'node:stream';
import { camelCase, chunk, isError, isNotNil, kebabCase } from 'es-toolkit';
import { DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS } from '../constants';
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

export class CosStorageAdapter implements IStorage {
  protected readonly client: COS;

  get bucketName(): string {
    return this.options.bucket;
  }

  constructor(protected readonly options: ICosStorageOptions) {
    if (options.vendor !== 'cos') {
      throw new Error('Invalid storage vendor: expected "cos"');
    }

    this.client = new COS({
      SecretId: options.credentials.accessKeyId,
      SecretKey: options.credentials.secretAccessKey,
      UseAccelerate: options.useAccelerate,
      Protocol: options.protocol,
      Domain: options.domain,
      Proxy: options.proxy
    });
  }

  private handleCosError(err: unknown): Error {
    const error = err instanceof Error ? err : new Error('Unknown COS error');
    Object.assign(error, typeof err === 'object' ? { ...err } : undefined);
    return error;
  }

  async checkObjectExists(params: Storage.ExistsObjectParams): Promise<Storage.ExistsObjectResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    let exists = false;
    await new Promise<void>((resolve, reject) => {
      this.client.headObject(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key
        },
        (err, _data) => {
          if (err && err.statusCode === 404) {
            exists = false;
            return resolve();
          }

          if (err) {
            return reject(this.handleCosError(err));
          }

          exists = true;
          resolve();
        }
      );
    });

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

    const result = await new Promise<COS.HeadObjectResult>((resolve, reject) => {
      this.client.headObject(
        {
          Key: key,
          Bucket: this.options.bucket,
          Region: this.options.region
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }

          resolve(data);
        }
      );
    });

    const metadata: Storage.StorageObjectMetadata = {};
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, val]) => {
        if (key.startsWith('x-cos-meta-')) {
          metadata[camelCase(key.replace('x-cos-meta-', ''))] = String(val);
        }
      });
    }

    return {
      metadata,
      key,
      etag: result.ETag,
      bucket: this.options.bucket,
      contentType: result.headers?.['content-type'],
      contentLength: result.headers?.['content-length']
        ? Number(result.headers['content-length'])
        : undefined
    };
  }

  async ensureBucket(): Promise<Storage.EnsureBucketResult> {
    await new Promise<COS.HeadBucketResult>((resolve, reject) => {
      this.client.headBucket(
        {
          Bucket: this.options.bucket,
          Region: this.options.region
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }

          resolve(data);
        }
      );
    });

    return {
      exists: true,
      created: false,
      bucket: this.options.bucket
    };
  }

  async uploadObject(params: Storage.UploadObjectParams): Promise<Storage.UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;
    assertStorageObjectKey(key);

    const headers: Record<string, string> = {};
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;

    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        headers[`x-cos-meta-${kebabCase(k)}`] = String(v);
      }
    }

    await new Promise<COS.PutObjectResult>((resolve, reject) => {
      this.client.putObject(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: contentLength,
          Headers: Object.keys(headers).length ? headers : undefined
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }
          resolve(data);
        }
      );
    });

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

    const headers: Record<string, string> = {};
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;
    for (const [metadataKey, value] of Object.entries(metadata ?? {})) {
      if (!metadataKey) continue;
      headers[`x-cos-meta-${kebabCase(metadataKey)}`] = String(value);
    }

    const result = await new Promise<COS.MultipartInitResult>((resolve, reject) => {
      this.client.multipartInit(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          ContentType: contentType,
          // COS SDK 的 multipartInit 实现会直接写入 Headers；即使没有自定义 header 也必须传空对象。
          Headers: headers
        },
        (err, data) => {
          if (err) return reject(this.handleCosError(err));
          resolve(data);
        }
      );
    });

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

    const result = await new Promise<COS.MultipartUploadResult>((resolve, reject) => {
      this.client.multipartUpload(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
          ContentLength: contentLength
        },
        (err, data) => {
          if (err) return reject(this.handleCosError(err));
          resolve(data);
        }
      );
    });

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

    await new Promise<COS.MultipartCompleteResult>((resolve, reject) => {
      this.client.multipartComplete(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          UploadId: uploadId,
          Parts: parts.map(({ partNumber, etag }) => ({
            PartNumber: partNumber,
            ETag: etag
          }))
        },
        (err, data) => {
          if (err) return reject(this.handleCosError(err));
          resolve(data);
        }
      );
    });

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
      await new Promise<COS.MultipartAbortResult>((resolve, reject) => {
        this.client.multipartAbort(
          {
            Bucket: this.options.bucket,
            Region: this.options.region,
            Key: key,
            UploadId: uploadId
          },
          (err, data) => {
            if (err) return reject(this.handleCosError(err));
            resolve(data);
          }
        );
      });
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
    assertStorageObjectKey(params.key);
    throwIfStorageDownloadAborted(params.abortSignal);

    // COS returns the output stream before reporting a missing-object error.
    // Preflight with HEAD so IStorage rejects missing downloads consistently.
    await new Promise<void>((resolve, reject) => {
      this.client.headObject(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: params.key
        },
        (err) => {
          if (err) return reject(this.handleCosError(err));
          resolve();
        }
      );
    });

    const passThrough = new PassThrough();
    bindAbortSignalToReadable({ readable: passThrough, abortSignal: params.abortSignal });

    this.client.getObject(
      {
        Bucket: this.options.bucket,
        Region: this.options.region,
        Key: params.key,
        Output: passThrough
      },
      (err, _data) => {
        if (err) {
          passThrough.destroy(isError(err.error) ? err.error : this.handleCosError(err));
        }
      }
    );

    return {
      bucket: this.options.bucket,
      key: params.key,
      body: passThrough
    };
  }

  async deleteObject(params: Storage.DeleteObjectParams): Promise<Storage.DeleteObjectResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    await new Promise<COS.DeleteObjectResult>((resolve, reject) => {
      this.client.deleteObject(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }
          resolve(data);
        }
      );
    });

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

    // COS 单次 DeleteMultipleObject 最多接受 1000 个对象。
    const failedKeys: Storage.StorageObjectKey[] = [];
    for (const keyChunk of chunk(keys, 1000)) {
      const result = await new Promise<COS.DeleteMultipleObjectResult>((resolve, reject) => {
        this.client.deleteMultipleObject(
          {
            Bucket: this.options.bucket,
            Region: this.options.region,
            Objects: keyChunk.map((key) => ({ Key: key }))
          },
          (err, data) => {
            if (err) {
              return reject(this.handleCosError(err));
            }
            resolve(data);
          }
        );
      });

      failedKeys.push(...(result.Error?.map((e) => e.Key).filter(isNotNil) ?? []));
    }

    return {
      keys: failedKeys,
      bucket: this.options.bucket
    };
  }

  async deleteObjectsByPrefix(
    params: Storage.DeleteObjectsByPrefixParams
  ): Promise<Storage.DeleteObjectsResult> {
    const { prefix } = params;
    assertRequiredStorageObjectPrefix(prefix);

    const fails: Storage.StorageObjectKey[] = [];
    let marker: string | undefined = undefined;

    await new Promise<void>((resolve, reject) => {
      const handler = () => {
        this.client.getBucket(
          {
            Bucket: this.options.bucket,
            Region: this.options.region,
            Prefix: prefix,
            MaxKeys: 1000,
            Marker: marker
          },
          (listErr, listData) => {
            if (listErr) {
              return reject(this.handleCosError(listErr));
            }

            if (!listData.Contents || listData.Contents.length === 0) {
              return resolve();
            }

            const objectsToDelete = listData.Contents.map((content) => ({ Key: content.Key }));

            this.client.deleteMultipleObject(
              {
                Bucket: this.options.bucket,
                Region: this.options.region,
                Objects: objectsToDelete
              },
              (deleteErr, deleteData) => {
                if (deleteErr) {
                  fails.push(...objectsToDelete.map((content) => content.Key));
                  if (listData.IsTruncated === 'true') {
                    marker = listData.NextMarker;
                    return handler();
                  }

                  return resolve();
                }

                fails.push(...deleteData.Error.map((e) => e.Key).filter(isNotNil));

                if (listData.IsTruncated === 'true') {
                  marker = listData.NextMarker;
                  return handler();
                }

                resolve();
              }
            );
          }
        );
      };

      handler();
    });

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

    const meta: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        meta[`x-cos-meta-${kebabCase(k)}`] = String(v);
      }
    }

    if (contentType) {
      meta['Content-Type'] = contentType;
    }

    const url = await new Promise<string>((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          Expires: expiresIn,
          Sign: true,
          Method: 'PUT'
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }
          resolve(data.Url);
        }
      );
    });

    return {
      key,
      url: url,
      bucket: this.options.bucket,
      metadata: meta
    };
  }

  async generatePresignedGetUrl(
    params: Storage.PresignedGetUrlParams
  ): Promise<Storage.PresignedGetUrlResult> {
    const { key, expiredSeconds, responseContentType } = params;
    assertStorageObjectKey(key);
    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const url = await new Promise<string>((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          Expires: expiresIn,
          Sign: true,
          Method: 'GET',
          ...(responseContentType
            ? { Query: { 'response-content-type': responseContentType } }
            : {})
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }
          resolve(data.Url);
        }
      );
    });

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
    if (this.options.domain) {
      url = `${this.options.protocol}//${this.options.domain}/${encodedKey}`;
    } else {
      url = `${this.options.protocol}//${this.options.bucket}.cos.${this.options.region}.myqcloud.com/${encodedKey}`;
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
    let marker: string | undefined = undefined;

    await new Promise<void>((resolve, reject) => {
      const handler = () => {
        this.client.getBucket(
          {
            Bucket: this.options.bucket,
            Region: this.options.region,
            Prefix: prefix,
            Marker: marker,
            MaxKeys: 1000
          },
          (err, data) => {
            if (err) {
              return reject(this.handleCosError(err));
            }

            keys = keys.concat(data.Contents?.map((content) => content.Key).filter(isNotNil) ?? []);

            if (data.IsTruncated === 'true') {
              marker = data.NextMarker;
              return handler();
            }

            resolve();
          }
        );
      };

      handler();
    });

    return {
      keys,
      bucket: this.options.bucket
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

    await new Promise<COS.SliceCopyFileResult>((resolve, reject) => {
      const copySource = `${this.options.bucket}.cos.${this.options.region}.myqcloud.com/${encodedSourceKey}`;

      this.client.sliceCopyFile(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: targetKey,
          CopySource: copySource
        },
        (err, data) => {
          if (err) {
            return reject(this.handleCosError(err));
          }
          resolve(data);
        }
      );
    });

    return {
      bucket: this.options.bucket,
      sourceKey,
      targetKey
    };
  }

  async destroy(): Promise<void> {}
}
