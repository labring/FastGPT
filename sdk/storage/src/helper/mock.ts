import type { Readable } from 'node:stream';
import { Readable as NodeReadable } from 'node:stream';
import type { IStorage } from '../interface';
import type * as Storage from '../types';
import {
  assertMultipartContentLength,
  assertMultipartPartNumber,
  assertMultipartUploadId,
  assertMultipartUploadParts,
  assertStorageObjectKey,
  assertStorageObjectKeys,
  assertStorageObjectPrefix,
  assertRequiredStorageObjectPrefix
} from '../assert';
import { bindAbortSignalToReadable, throwIfStorageDownloadAborted } from '../utils';

type MockFunction<T extends (...args: any[]) => any> = T & {
  mock: unknown;
};

type VitestLike = {
  fn: <T extends (...args: any[]) => any>(impl?: T) => MockFunction<T>;
};

type StoredObject = {
  body: Buffer;
  metadata: Storage.StorageObjectMetadata;
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  etag?: string;
};

type StoredMultipartUpload = {
  key: Storage.StorageObjectKey;
  contentType?: string;
  contentDisposition?: string;
  metadata: Storage.StorageObjectMetadata;
  parts: Map<number, Buffer>;
};

export type VitestStorageMock = IStorage & {
  /** 便于在测试中直接读写内存对象（key -> object）。 */
  __objects: Map<Storage.StorageObjectKey, StoredObject>;
  /** 便于测试 Multipart 的孤儿分片是否已被 complete/abort 清理。 */
  __multipartUploads: Map<string, StoredMultipartUpload>;
  /** 清空内存对象。 */
  __reset: () => void;
  /** 直接写入一个对象（绕过 uploadObject）。 */
  __putObject: (
    key: Storage.StorageObjectKey,
    obj: Partial<StoredObject> & { body: Buffer }
  ) => void;
};

export type CreateVitestStorageMockParams = {
  vi: VitestLike;
  bucketName?: string;
  /**
   * 用于构造 presigned/public URL 的 base（仅 mock 用）。
   * 例如：`https://mock-storage.local`
   */
  baseUrl?: string;
};

async function bodyToBuffer(body: Storage.StorageUploadBody): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  return await readableToBuffer(body);
}

async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function bufferToReadable(buf: Buffer): Readable {
  return NodeReadable.from(buf);
}

function getEtag(buf: Buffer) {
  // mock: 非加密 hash，只是为了在测试里有稳定值可断言
  return `etag_${buf.length}_${buf.subarray(0, 8).toString('hex')}`;
}

export function createVitestStorageMock(params: CreateVitestStorageMockParams): VitestStorageMock {
  const { vi, bucketName = 'mock-bucket', baseUrl = 'https://mock-storage.local' } = params;

  const objects = new Map<Storage.StorageObjectKey, StoredObject>();
  const multipartUploads = new Map<string, StoredMultipartUpload>();
  let nextMultipartUploadId = 1;
  let bucketEnsured = false;

  const ensureBucket = vi.fn(async (): Promise<Storage.EnsureBucketResult> => {
    const exists = bucketEnsured;
    bucketEnsured = true;
    return { exists, created: !exists, bucket: bucketName };
  });

  const checkObjectExists = vi.fn(
    async ({ key }: Storage.ExistsObjectParams): Promise<Storage.ExistsObjectResult> => {
      assertStorageObjectKey(key);
      return { bucket: bucketName, key, exists: objects.has(key) };
    }
  );

  const uploadObject = vi.fn(
    async (p: Storage.UploadObjectParams): Promise<Storage.UploadObjectResult> => {
      assertStorageObjectKey(p.key);
      const buf = await bodyToBuffer(p.body);
      const contentLength = p.contentLength ?? buf.length;
      objects.set(p.key, {
        body: buf,
        metadata: p.metadata ?? {},
        contentType: p.contentType,
        contentDisposition: p.contentDisposition,
        contentLength,
        etag: getEtag(buf)
      });
      return { bucket: bucketName, key: p.key };
    }
  );

  const createMultipartUpload = vi.fn(
    async (
      p: Storage.CreateMultipartUploadParams
    ): Promise<Storage.CreateMultipartUploadResult> => {
      assertStorageObjectKey(p.key);
      const uploadId = `mock-multipart-${nextMultipartUploadId}`;
      nextMultipartUploadId += 1;
      multipartUploads.set(uploadId, {
        key: p.key,
        contentType: p.contentType,
        contentDisposition: p.contentDisposition,
        metadata: p.metadata ?? {},
        parts: new Map()
      });
      return { bucket: bucketName, key: p.key, uploadId };
    }
  );

  const uploadMultipartPart = vi.fn(
    async (p: Storage.UploadMultipartPartParams): Promise<Storage.UploadMultipartPartResult> => {
      assertStorageObjectKey(p.key);
      assertMultipartUploadId(p.uploadId);
      assertMultipartPartNumber(p.partNumber);
      assertMultipartContentLength(p.contentLength);

      const upload = multipartUploads.get(p.uploadId);
      if (!upload || upload.key !== p.key) {
        throw new Error('Multipart upload not found');
      }

      const body = await bodyToBuffer(p.body);
      if (body.length !== p.contentLength) {
        throw new Error('Multipart contentLength does not match body');
      }
      upload.parts.set(p.partNumber, body);

      return {
        bucket: bucketName,
        key: p.key,
        uploadId: p.uploadId,
        partNumber: p.partNumber,
        etag: getEtag(body)
      };
    }
  );

  const completeMultipartUpload = vi.fn(
    async (
      p: Storage.CompleteMultipartUploadParams
    ): Promise<Storage.CompleteMultipartUploadResult> => {
      assertStorageObjectKey(p.key);
      assertMultipartUploadId(p.uploadId);
      assertMultipartUploadParts(p.parts);

      const upload = multipartUploads.get(p.uploadId);
      if (!upload || upload.key !== p.key) {
        throw new Error('Multipart upload not found');
      }

      const partBodies = p.parts.map(({ partNumber }) => {
        const body = upload.parts.get(partNumber);
        if (!body) throw new Error(`Multipart part ${partNumber} not found`);
        return body;
      });
      const body = Buffer.concat(partBodies);
      objects.set(p.key, {
        body,
        metadata: upload.metadata,
        contentType: upload.contentType,
        contentDisposition: upload.contentDisposition,
        contentLength: body.length,
        etag: getEtag(body)
      });
      multipartUploads.delete(p.uploadId);

      return { bucket: bucketName, key: p.key };
    }
  );

  const abortMultipartUpload = vi.fn(
    async (p: Storage.AbortMultipartUploadParams): Promise<Storage.AbortMultipartUploadResult> => {
      assertStorageObjectKey(p.key);
      assertMultipartUploadId(p.uploadId);
      const upload = multipartUploads.get(p.uploadId);
      if (upload && upload.key !== p.key) {
        throw new Error('Multipart upload not found');
      }
      multipartUploads.delete(p.uploadId);
      return { bucket: bucketName, key: p.key, uploadId: p.uploadId };
    }
  );

  const downloadObject = vi.fn(
    async (p: Storage.DownloadObjectParams): Promise<Storage.DownloadObjectResult> => {
      assertStorageObjectKey(p.key);
      throwIfStorageDownloadAborted(p.abortSignal);

      const obj = objects.get(p.key);
      if (!obj) {
        throw new Error(`Object not found: ${p.key}`);
      }
      const body = bufferToReadable(obj.body);
      bindAbortSignalToReadable({ readable: body, abortSignal: p.abortSignal });

      return { bucket: bucketName, key: p.key, body };
    }
  );

  const deleteObject = vi.fn(
    async (p: Storage.DeleteObjectParams): Promise<Storage.DeleteObjectResult> => {
      assertStorageObjectKey(p.key);
      objects.delete(p.key);
      return { bucket: bucketName, key: p.key };
    }
  );

  const deleteObjectsByMultiKeys = vi.fn(
    async (p: Storage.DeleteObjectsParams): Promise<Storage.DeleteObjectsResult> => {
      assertStorageObjectKeys(p.keys);
      for (const key of p.keys) objects.delete(key);
      return { bucket: bucketName, keys: [] };
    }
  );

  const deleteObjectsByRawKeys = vi.fn(
    async (p: Storage.DeleteObjectsParams): Promise<Storage.DeleteObjectsResult> => {
      for (const key of p.keys) objects.delete(key);
      return { bucket: bucketName, keys: [] };
    }
  );

  const deleteObjectsByPrefix = vi.fn(
    async (p: Storage.DeleteObjectsByPrefixParams): Promise<Storage.DeleteObjectsResult> => {
      assertRequiredStorageObjectPrefix(p.prefix);
      const keys: string[] = [];
      for (const key of objects.keys()) {
        if (key.startsWith(p.prefix)) keys.push(key);
      }
      for (const key of keys) objects.delete(key);
      return { bucket: bucketName, keys: [] };
    }
  );

  const generatePresignedPutUrl = vi.fn(
    async (p: Storage.PresignedPutUrlParams): Promise<Storage.PresignedPutUrlResult> => {
      assertStorageObjectKey(p.key);
      const putUrl = `${baseUrl}/put/${encodeURIComponent(bucketName)}/${encodeURIComponent(p.key)}`;
      // mock: 直接透传 metadata 作为“headers”
      const metadata: Record<string, string> = p.metadata ? { ...p.metadata } : {};
      return { bucket: bucketName, key: p.key, url: putUrl, metadata };
    }
  );

  const generatePresignedGetUrl = vi.fn(
    async (p: Storage.PresignedGetUrlParams): Promise<Storage.PresignedGetUrlResult> => {
      assertStorageObjectKey(p.key);
      const query = p.responseContentType
        ? `?response-content-type=${encodeURIComponent(p.responseContentType)}`
        : '';
      const getUrl = `${baseUrl}/get/${encodeURIComponent(bucketName)}/${encodeURIComponent(p.key)}${query}`;
      return { bucket: bucketName, key: p.key, url: getUrl };
    }
  );

  const generatePublicGetUrl = vi.fn(
    ({ key }: Storage.GeneratePublicGetUrlParams): Storage.GeneratePublicGetUrlResult => {
      assertStorageObjectKey(key);
      const publicGetUrl = `${baseUrl}/public/${encodeURIComponent(bucketName)}/${encodeURIComponent(key)}`;
      return { url: publicGetUrl, bucket: bucketName, key };
    }
  );

  const listObjects = vi.fn(
    async (p: Storage.ListObjectsParams): Promise<Storage.ListObjectsResult> => {
      assertStorageObjectPrefix(p.prefix);
      const keys = Array.from(objects.keys()).filter((k) =>
        p.prefix ? k.startsWith(p.prefix) : true
      );
      keys.sort();
      return { bucket: bucketName, keys };
    }
  );

  const copyObjectInSelfBucket = vi.fn(
    async (p: Storage.CopyObjectParams): Promise<Storage.CopyObjectResult> => {
      assertStorageObjectKey(p.sourceKey, 'sourceKey');
      assertStorageObjectKey(p.targetKey, 'targetKey');
      const src = objects.get(p.sourceKey);
      if (!src) {
        throw new Error(`Source object not found: ${p.sourceKey}`);
      }
      objects.set(p.targetKey, { ...src, body: Buffer.from(src.body) });
      return { bucket: bucketName, sourceKey: p.sourceKey, targetKey: p.targetKey };
    }
  );

  const getObjectMetadata = vi.fn(
    async (p: Storage.GetObjectMetadataParams): Promise<Storage.GetObjectMetadataResult> => {
      assertStorageObjectKey(p.key);
      const obj = objects.get(p.key);
      if (!obj) {
        throw new Error(`Object not found: ${p.key}`);
      }
      return {
        bucket: bucketName,
        key: p.key,
        metadata: obj.metadata ?? {},
        contentType: obj.contentType,
        contentLength: obj.contentLength,
        etag: obj.etag
      };
    }
  );

  const destroy = vi.fn(async (): Promise<void> => {});

  const mock: VitestStorageMock = {
    bucketName,
    ensureBucket,
    checkObjectExists,
    uploadObject,
    createMultipartUpload,
    uploadMultipartPart,
    completeMultipartUpload,
    abortMultipartUpload,
    downloadObject,
    deleteObject,
    deleteObjectsByMultiKeys,
    deleteObjectsByRawKeys,
    deleteObjectsByPrefix,
    generatePresignedPutUrl,
    generatePresignedGetUrl,
    generatePublicGetUrl,
    listObjects,
    copyObjectInSelfBucket,
    getObjectMetadata,
    destroy,
    __objects: objects,
    __multipartUploads: multipartUploads,
    __reset: () => {
      objects.clear();
      multipartUploads.clear();
      nextMultipartUploadId = 1;
    },
    __putObject: (key, obj) => {
      objects.set(key, {
        body: obj.body,
        metadata: obj.metadata ?? {},
        contentType: obj.contentType,
        contentLength: obj.contentLength ?? obj.body.length,
        contentDisposition: obj.contentDisposition,
        etag: obj.etag ?? getEtag(obj.body)
      });
    }
  };

  return mock;
}
