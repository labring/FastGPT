import OSS from 'ali-oss';
import type { IOssStorageOptions, IStorage } from '../interface';
import type * as Storage from '../types';
import type { Readable } from 'node:stream';
import { camelCase, chunk, difference, kebabCase } from 'es-toolkit';
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
  containsStorageObjectControlCharacter,
  isNoSuchMultipartUploadError
} from '../assert';

export class OssStorageAdapter implements IStorage {
  protected readonly client: OSS;

  constructor(protected readonly options: IOssStorageOptions) {
    if (options.vendor !== 'oss') {
      throw new Error('Invalid storage vendor: expected "oss"');
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

  async checkObjectExists(params: Storage.ExistsObjectParams): Promise<Storage.ExistsObjectResult> {
    const { key } = params;
    assertStorageObjectKey(key);

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

  async getObjectMetadata(
    params: Storage.GetObjectMetadataParams
  ): Promise<Storage.GetObjectMetadataResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    const result = await this.client.head(key);

    const metadata: Storage.StorageObjectMetadata = {};
    if (result.meta) {
      for (const [k, v] of Object.entries(result.meta)) {
        if (!k) continue;
        metadata[camelCase(k)] = String(v);
      }
    }

    const headers = result.res.headers as Record<string, string>;
    const etag =
      headers.etag ?? Object.entries(headers).find(([key]) => key.toLowerCase() === 'etag')?.[1];

    const normalizedEtag = etag?.replace(/"/g, '');

    return {
      key,
      metadata,
      etag: normalizedEtag,
      bucket: this.options.bucket,
      contentType: headers['content-type'],
      contentLength: headers['content-length'] ? Number(headers['content-length']) : undefined
    };
  }

  async ensureBucket(): Promise<Storage.EnsureBucketResult> {
    // Use list() instead of getBucketInfo() to verify bucket access.
    // getBucketInfo() references a variable named `name` internally which conflicts
    // with JavaScript's global `name` property in bundled environments (e.g. Next.js),
    // causing "ReferenceError: name is not defined".
    await this.client.list({ 'max-keys': 1 }, {});

    return {
      exists: true,
      created: false,
      bucket: this.options.bucket
    };
  }

  async uploadObject(params: Storage.UploadObjectParams): Promise<Storage.UploadObjectResult> {
    const { key, body, contentType, contentLength, contentDisposition, metadata } = params;
    assertStorageObjectKey(key);
    // ali-oss 会把字符串 body 当成本地文件路径，因此先转成字节以满足 IStorage 契约。
    const uploadBody = typeof body === 'string' ? Buffer.from(body) : body;

    const headers: Record<string, any> = {
      'x-oss-storage-class': 'Standard',
      'x-oss-forbid-overwrite': 'false'
    };
    if (contentType) headers['Content-Type'] = contentType;
    if (contentLength !== undefined) headers['Content-Length'] = String(contentLength);
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;

    const meta = {} as Storage.StorageObjectMetadata & OSS.UserMeta;
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (!k) continue;
        meta[kebabCase(k)] = String(v);
      }
    }

    await this.client.put(key, uploadBody, {
      headers,
      mime: contentType,
      meta
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
      headers[`x-oss-meta-${kebabCase(metadataKey)}`] = String(value);
    }

    const result = await this.client.initMultipartUpload(key, {
      headers,
      mime: contentType
    });
    if (!result?.uploadId) {
      throw new Error('Multipart upload initialization did not return an uploadId');
    }

    return {
      bucket: this.options.bucket,
      key,
      uploadId: result.uploadId
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

    const uploadBody = typeof body === 'string' ? Buffer.from(body) : body;
    const result = await this.client.uploadPart(
      key,
      uploadId,
      partNumber,
      uploadBody,
      0,
      contentLength
    );
    if (!result?.etag) {
      throw new Error('Multipart part upload did not return an ETag');
    }

    return {
      bucket: this.options.bucket,
      key,
      uploadId,
      partNumber,
      etag: result.etag
    };
  }

  async completeMultipartUpload(
    params: Storage.CompleteMultipartUploadParams
  ): Promise<Storage.CompleteMultipartUploadResult> {
    const { key, uploadId, parts } = params;
    assertStorageObjectKey(key);
    assertMultipartUploadId(uploadId);
    assertMultipartUploadParts(parts);

    await this.client.completeMultipartUpload(
      key,
      uploadId,
      parts.map(({ partNumber, etag }) => ({ number: partNumber, etag }))
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
      await this.client.abortMultipartUpload(key, uploadId);
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

    const result = await this.client.getStream(key);
    const stream = result.stream as Readable;
    bindAbortSignalToReadable({ readable: stream, abortSignal });

    return {
      key,
      bucket: this.options.bucket,
      body: stream
    };
  }

  async deleteObject(params: Storage.DeleteObjectParams): Promise<Storage.DeleteObjectResult> {
    const { key } = params;
    assertStorageObjectKey(key);

    await this.client.delete(key);

    return {
      bucket: this.options.bucket,
      key
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

    const failedKeys: Storage.StorageObjectKey[] = [];
    // 含 ASCII 控制字符的 key 不能放进 XML 请求体（XML 1.0 会把字面 CR/CRLF 规范化成 LF），
    // 改走单对象 DELETE：key 经 URL 编码后与对象真实名称一致。
    const controlCharacterKeys = keys.filter((key) => containsStorageObjectControlCharacter(key));
    const xmlSafeKeys = keys.filter((key) => !containsStorageObjectControlCharacter(key));

    for (const key of controlCharacterKeys) {
      try {
        await this.client.delete(key);
      } catch {
        failedKeys.push(key);
      }
    }

    // OSS 单次 DeleteMultipleObjects 最多接受 1000 个 key；verbose 模式会返回成功删除的 key。
    for (const keyChunk of chunk(xmlSafeKeys, 1000)) {
      const result = await this.client.deleteMulti(keyChunk, { quiet: false });
      const deletedKeys = (() => {
        const deletedItems: unknown = result.deleted;
        if (!Array.isArray(deletedItems)) return [];

        const normalizedKeys: string[] = [];
        for (const item of deletedItems) {
          if (typeof item === 'string') {
            normalizedKeys.push(item);
            continue;
          }
          // ali-oss 的类型声明是 string[]，但标准 OSS XML 在运行时解析为 { Key }[]。
          if (item && typeof item === 'object' && 'Key' in item && typeof item.Key === 'string') {
            normalizedKeys.push(item.Key);
            continue;
          }
          return [];
        }
        return normalizedKeys;
      })();

      failedKeys.push(...difference(keyChunk, deletedKeys));
    }

    return {
      bucket: this.options.bucket,
      keys: failedKeys
    };
  }

  async deleteObjectsByPrefix(
    params: Storage.DeleteObjectsByPrefixParams
  ): Promise<Storage.DeleteObjectsResult> {
    const { prefix } = params;
    assertRequiredStorageObjectPrefix(prefix);

    const fails: Storage.StorageObjectKey[] = [];
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
          keys: fails
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

  async generatePresignedPutUrl(
    params: Storage.PresignedPutUrlParams
  ): Promise<Storage.PresignedPutUrlResult> {
    const { key, expiredSeconds, metadata, contentType } = params;
    assertStorageObjectKey(key);

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

  async generatePresignedGetUrl(
    params: Storage.PresignedGetUrlParams
  ): Promise<Storage.PresignedGetUrlResult> {
    const { key, expiredSeconds } = params;
    assertStorageObjectKey(key);
    const expiresIn = expiredSeconds ? expiredSeconds : DEFAULT_PRESIGNED_URL_EXPIRED_SECONDS;

    // OSS 不支持 response-content-type 覆盖，会返回 InvalidRequest；
    // 保持签名 URL 有效并沿用对象保存时的 Content-Type。
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

  generatePublicGetUrl(
    params: Storage.GeneratePublicGetUrlParams
  ): Storage.GeneratePublicGetUrlResult {
    const { key } = params;
    assertStorageObjectKey(key);
    const encodedKey = encodeObjectKeyPath(key);

    let protocol = 'https:';
    if (!this.options.secure) {
      protocol = 'http:';
    }

    let url: string;
    if (this.options.cname) {
      url = `${protocol}//${this.options.endpoint}/${encodedKey}`;
    } else {
      url = `${protocol}//${this.options.bucket}.${this.options.region}.aliyuncs.com/${encodedKey}`;
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

  async copyObjectInSelfBucket(
    params: Storage.CopyObjectParams
  ): Promise<Storage.CopyObjectResult> {
    const { sourceKey, targetKey } = params;
    assertStorageObjectKey(sourceKey, 'sourceKey');
    assertStorageObjectKey(targetKey, 'targetKey');

    await this.client.copy(targetKey, sourceKey);

    return {
      bucket: this.options.bucket,
      sourceKey,
      targetKey
    };
  }

  async destroy(): Promise<void> {}
}
