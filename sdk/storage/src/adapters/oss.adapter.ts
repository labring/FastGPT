import OSS from 'ali-oss';
import type { IOssStorageOptions, IStorage } from '../interface';
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
import { camelCase, difference, kebabCase } from 'es-toolkit';
import { DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS } from '../constants';

export class OssStorageAdapter implements IStorage {
  protected readonly client: OSS;

  constructor(protected readonly options: IOssStorageOptions) {
    if (options.vendor !== 'oss') {
      throw new Error('Invalid storage vendor');
    }

    this.client = new OSS({
      accessKeyId: options.credentials.accessKeyId,
      accessKeySecret: options.credentials.secretAccessKey,
      region: options.region,
      endpoint: options.endpoint,
      bucket: options.bucket,
      cname: options.cname,
      internal: options.internal,
      secure: options.secure,

      // @ts-expect-error ali-oss SDK 类型未定义但存在此属性
      enableProxy: options.proxy ? true : false
    });
  }

  get bucketName(): string {
    return this.options.bucket;
  }

  async checkObjectExists(params: ExistsObjectParams): Promise<ExistsObjectResult> {
    const { key } = params;

    let exists = false;
    try {
      await this.client.head(key);
      exists = true;
    } catch (error: any) {
      if (error?.code === 'NoSuchKey') {
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

    const result = await this.client.head(key);

    let metadata: StorageObjectMetadata = {};
    if (result.meta) {
      for (const [k, v] of Object.entries(result.meta)) {
        if (!k) continue;
        metadata[camelCase(k)] = String(v);
      }
    }

    const headers = result.res.headers as Record<string, string>;

    return {
      key,
      metadata,
      etag: result.meta?.etag as string,
      bucket: this.options.bucket,
      contentType: headers['content-type'],
      contentLength: headers['content-length'] ? Number(headers['content-length']) : undefined
    };
  }

  async ensureBucket(): Promise<EnsureBucketResult> {
    await this.client.getBucketInfo(this.options.bucket);

    return {
      exists: true,
      created: false,
      bucket: this.options.bucket
    };
  }

  async uploadObject(params: UploadObjectParams): Promise<UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;

    const headers: Record<string, any> = {
      'x-oss-storage-class': 'Standard',
      'x-oss-forbid-overwrite': 'false'
    };
    if (contentType) headers['Content-Type'] = contentType;
    if (contentLength !== undefined) headers['Content-Length'] = String(contentLength);
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;

    let meta = {} as StorageObjectMetadata & OSS.UserMeta;
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        meta[kebabCase(k)] = String(v);
      }
    }

    await this.client.put(key, body, {
      headers,
      mime: contentType,
      meta
    });

    return {
      key,
      bucket: this.options.bucket
    };
  }

  async downloadObject(params: DownloadObjectParams): Promise<DownloadObjectResult> {
    const { key } = params;

    const result = await this.client.getStream(key);

    return {
      key,
      bucket: this.options.bucket,
      body: result.stream as Readable
    };
  }

  async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResult> {
    const { key } = params;

    await this.client.delete(key);

    return {
      bucket: this.options.bucket,
      key
    };
  }

  async deleteObjectsByMultiKeys(params: DeleteObjectsParams): Promise<DeleteObjectsResult> {
    const { keys } = params;

    const result = await this.client.deleteMulti(keys, { quiet: true });

    return {
      bucket: this.options.bucket,
      keys: difference(keys, result.deleted ?? [])
    };
  }

  async deleteObjectsByPrefix(params: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult> {
    const { prefix } = params;
    if (!prefix) {
      throw new Error('Prefix is required');
    }

    const fails: StorageObjectKey[] = [];
    let marker: string | undefined = undefined;
    let isTruncated = false;

    do {
      const listResponse = await this.client.list(
        {
          prefix,
          'max-keys': 1000,
          marker
        },
        {
          timeout: 60000
        }
      );

      if (!listResponse.objects || listResponse.objects.length === 0) {
        return {
          bucket: this.options.bucket,
          keys: []
        };
      }

      const objectsToDelete = listResponse.objects.map((object) => object.name);
      const deleteResponse = await this.deleteObjectsByMultiKeys({ keys: objectsToDelete });

      fails.push(...deleteResponse.keys);

      isTruncated = listResponse.isTruncated ?? false;
      marker = listResponse.nextMarker;
    } while (isTruncated);

    return {
      bucket: this.options.bucket,
      keys: fails
    };
  }

  async generatePresignedPutUrl(params: PresignedPutUrlParams): Promise<PresignedPutUrlResult> {
    const { key, expiredSeconds, metadata, contentType } = params;

    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const headersToSign: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        headersToSign[`x-oss-meta-${kebabCase(k)}`] = String(v);
      }
    }

    if (contentType) {
      headersToSign['Content-Type'] = contentType;
    }

    // @ts-expect-error ali-oss SDK 类型未定义但存在此方法
    // @see https://github.com/ali-sdk/ali-oss?tab=readme-ov-file#signatureurlv4method-expires-request-objectname-additionalheaders
    const url = await this.client.signatureUrlV4(
      'PUT',
      expiresIn,
      {
        headers: {
          ...headersToSign
        }
      },
      key
    );

    return {
      key,
      url: url,
      bucket: this.options.bucket,
      metadata: headersToSign
    };
  }

  async generatePresignedGetUrl(params: PresignedGetUrlParams): Promise<PresignedGetUrlResult> {
    const { key, expiredSeconds } = params;
    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    const url = this.client.signatureUrl(key, {
      method: 'GET',
      expires: expiresIn
    });

    return {
      key,
      url: url,
      bucket: this.options.bucket
    };
  }

  generatePublicGetUrl(params: GeneratePublicGetUrlParams): GeneratePublicGetUrlResult {
    const { key } = params;

    let protocol = 'https:';
    if (!this.options.secure) {
      protocol = 'http:';
    }

    let url: string;
    if (this.options.cname) {
      url = `${protocol}//${this.options.endpoint}/${key}`;
    } else {
      url = `${protocol}//${this.options.bucket}.${this.options.region}.aliyuncs.com/${key}`;
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
    let isTruncated = false;

    do {
      const listResponse = await this.client.list(
        {
          prefix,
          'max-keys': 1000,
          marker
        },
        {
          timeout: 60000
        }
      );

      if (!listResponse.objects || listResponse.objects.length === 0) {
        return {
          bucket: this.options.bucket,
          keys: []
        };
      }

      keys = keys.concat(listResponse.objects.map((object) => object.name));
      isTruncated = listResponse.isTruncated ?? false;
      marker = listResponse.nextMarker;
    } while (isTruncated);

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

    await this.client.copy(encodedSourceKey, targetKey);

    return {
      bucket: this.options.bucket,
      sourceKey,
      targetKey
    };
  }

  async destroy(): Promise<void> {}
}
