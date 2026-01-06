import type { Readable } from 'node:stream';
import { Readable as NodeReadable } from 'node:stream';
import type { MockedFunction } from 'vitest';
import type { IStorage } from '../interface';
import type {
  CopyObjectParams,
  CopyObjectResult,
  DeleteObjectParams,
  DeleteObjectResult,
  DeleteObjectsByPrefixParams,
  DeleteObjectsParams,
  DeleteObjectsResult,
  DownloadObjectParams,
  DownloadObjectResult,
  EnsureBucketResult,
  ExistsObjectParams,
  ExistsObjectResult,
  GeneratePublicGetUrlParams,
  GeneratePublicGetUrlResult,
  GetObjectMetadataParams,
  GetObjectMetadataResult,
  ListObjectsParams,
  ListObjectsResult,
  PresignedGetUrlParams,
  PresignedGetUrlResult,
  PresignedPutUrlParams,
  PresignedPutUrlResult,
  StorageObjectKey,
  StorageObjectMetadata,
  StorageUploadBody,
  UploadObjectParams,
  UploadObjectResult
} from '../types';

type VitestLike = {
  fn: <T extends (...args: any[]) => any>(impl?: T) => MockedFunction<T>;
};

type StoredObject = {
  body: Buffer;
  metadata: StorageObjectMetadata;
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  etag?: string;
};

export type VitestStorageMock = IStorage & {
  /** 便于在测试中直接读写内存对象（key -> object）。 */
  __objects: Map<StorageObjectKey, StoredObject>;
  /** 清空内存对象。 */
  __reset: () => void;
  /** 直接写入一个对象（绕过 uploadObject）。 */
  __putObject: (key: StorageObjectKey, obj: Partial<StoredObject> & { body: Buffer }) => void;
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

async function bodyToBuffer(body: StorageUploadBody): Promise<Buffer> {
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

  const objects = new Map<StorageObjectKey, StoredObject>();
  let bucketEnsured = false;

  const ensureBucket = vi.fn(async (): Promise<EnsureBucketResult> => {
    const exists = bucketEnsured;
    bucketEnsured = true;
    return { exists, created: !exists, bucket: bucketName };
  });

  const checkObjectExists = vi.fn(
    async ({ key }: ExistsObjectParams): Promise<ExistsObjectResult> => {
      return { bucket: bucketName, key, exists: objects.has(key) };
    }
  );

  const uploadObject = vi.fn(async (p: UploadObjectParams): Promise<UploadObjectResult> => {
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
  });

  const downloadObject = vi.fn(async (p: DownloadObjectParams): Promise<DownloadObjectResult> => {
    const obj = objects.get(p.key);
    if (!obj) {
      throw new Error(`Object not found: ${p.key}`);
    }
    return { bucket: bucketName, key: p.key, body: bufferToReadable(obj.body) };
  });

  const deleteObject = vi.fn(async (p: DeleteObjectParams): Promise<DeleteObjectResult> => {
    objects.delete(p.key);
    return { bucket: bucketName, key: p.key };
  });

  const deleteObjectsByMultiKeys = vi.fn(
    async (p: DeleteObjectsParams): Promise<DeleteObjectsResult> => {
      for (const key of p.keys) objects.delete(key);
      return { bucket: bucketName, keys: p.keys };
    }
  );

  const deleteObjectsByPrefix = vi.fn(
    async (p: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult> => {
      if (!p.prefix) {
        throw new Error('prefix must be a non-empty string');
      }
      const keys: string[] = [];
      for (const key of objects.keys()) {
        if (key.startsWith(p.prefix)) keys.push(key);
      }
      for (const key of keys) objects.delete(key);
      return { bucket: bucketName, keys };
    }
  );

  const generatePresignedPutUrl = vi.fn(
    async (p: PresignedPutUrlParams): Promise<PresignedPutUrlResult> => {
      const putUrl = `${baseUrl}/put/${encodeURIComponent(bucketName)}/${encodeURIComponent(p.key)}`;
      // mock: 直接透传 metadata 作为“headers”
      const metadata: Record<string, string> = p.metadata ? { ...p.metadata } : {};
      return { bucket: bucketName, key: p.key, url: putUrl, metadata };
    }
  );

  const generatePresignedGetUrl = vi.fn(
    async (p: PresignedGetUrlParams): Promise<PresignedGetUrlResult> => {
      const getUrl = `${baseUrl}/get/${encodeURIComponent(bucketName)}/${encodeURIComponent(p.key)}`;
      return { bucket: bucketName, key: p.key, url: getUrl };
    }
  );

  const generatePublicGetUrl = vi.fn(
    ({ key }: GeneratePublicGetUrlParams): GeneratePublicGetUrlResult => {
      const publicGetUrl = `${baseUrl}/public/${encodeURIComponent(bucketName)}/${encodeURIComponent(key)}`;
      return { url: publicGetUrl, bucket: bucketName, key };
    }
  );

  const listObjects = vi.fn(async (p: ListObjectsParams): Promise<ListObjectsResult> => {
    const keys = Array.from(objects.keys()).filter((k) =>
      p.prefix ? k.startsWith(p.prefix) : true
    );
    keys.sort();
    return { bucket: bucketName, keys };
  });

  const copyObjectInSelfBucket = vi.fn(async (p: CopyObjectParams): Promise<CopyObjectResult> => {
    const src = objects.get(p.sourceKey);
    if (!src) {
      throw new Error(`Source object not found: ${p.sourceKey}`);
    }
    objects.set(p.targetKey, { ...src, body: Buffer.from(src.body) });
    return { bucket: bucketName, sourceKey: p.sourceKey, targetKey: p.targetKey };
  });

  const getObjectMetadata = vi.fn(
    async (p: GetObjectMetadataParams): Promise<GetObjectMetadataResult> => {
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
    downloadObject,
    deleteObject,
    deleteObjectsByMultiKeys,
    deleteObjectsByPrefix,
    generatePresignedPutUrl,
    generatePresignedGetUrl,
    generatePublicGetUrl,
    listObjects,
    copyObjectInSelfBucket,
    getObjectMetadata,
    destroy,
    __objects: objects,
    __reset: () => objects.clear(),
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
