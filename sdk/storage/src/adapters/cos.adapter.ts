import COS from 'cos-nodejs-sdk-v5';
import type { ICosStorageOptions, IStorage } from '../interface';
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
import { PassThrough } from 'node:stream';
import { camelCase, isError, isNotNil, kebabCase } from 'es-toolkit';
import { DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS } from '../constants';

export class CosStorageAdapter implements IStorage {
  protected readonly client: COS;

  get bucketName(): string {
    return this.options.bucket;
  }

  constructor(protected readonly options: ICosStorageOptions) {
    if (options.vendor !== 'cos') {
      throw new Error('Invalid storage vendor');
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

  private handleCosError(err: any): Error {
    const error = new Error(err.message || 'Unknown COS error');
    Object.assign(error, { ...err });
    return error;
  }

  async checkObjectExists(params: ExistsObjectParams): Promise<ExistsObjectResult> {
    const { key } = params;

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

  async getObjectMetadata(params: GetObjectMetadataParams): Promise<GetObjectMetadataResult> {
    const { key } = params;

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

    let metadata: StorageObjectMetadata = {};
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

  async ensureBucket(): Promise<EnsureBucketResult> {
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

  async uploadObject(params: UploadObjectParams): Promise<UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;

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

  async downloadObject(params: DownloadObjectParams): Promise<DownloadObjectResult> {
    const passThrough = new PassThrough();

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

  async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResult> {
    const { key } = params;

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

  async deleteObjectsByMultiKeys(params: DeleteObjectsParams): Promise<DeleteObjectsResult> {
    const { keys } = params;

    const result = await new Promise<COS.DeleteMultipleObjectResult>((resolve, reject) => {
      this.client.deleteMultipleObject(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Objects: keys.map((key) => ({ Key: key }))
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
      keys: result.Error.map((e) => e.Key).filter(isNotNil),
      bucket: this.options.bucket
    };
  }

  async deleteObjectsByPrefix(params: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult> {
    const { prefix } = params;
    if (!prefix) {
      throw new Error('Prefix is required');
    }

    const fails: StorageObjectKey[] = [];
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

  async generatePresignedPutUrl(params: PresignedPutUrlParams): Promise<PresignedPutUrlResult> {
    const { key, expiredSeconds, metadata, contentType } = params;

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

  async generatePresignedGetUrl(params: PresignedGetUrlParams): Promise<PresignedGetUrlResult> {
    const { key, expiredSeconds } = params;
    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const url = await new Promise<string>((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          Expires: expiresIn,
          Sign: true,
          Method: 'GET'
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

  generatePublicGetUrl(params: GeneratePublicGetUrlParams): GeneratePublicGetUrlResult {
    const { key } = params;

    let url: string;
    if (this.options.domain) {
      url = `${this.options.protocol}//${this.options.domain}/${key}`;
    } else {
      url = `${this.options.protocol}//${this.options.bucket}.cos.${this.options.region}.myqcloud.com/${key}`;
    }

    return {
      key,
      url: url,
      bucket: this.options.bucket
    };
  }

  async listObjects(params: ListObjectsParams): Promise<ListObjectsResult> {
    const { prefix } = params;

    let keys: StorageObjectKey[] = [];
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

  async copyObjectInSelfBucket(params: CopyObjectParams): Promise<CopyObjectResult> {
    const { sourceKey, targetKey } = params;

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
