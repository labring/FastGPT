import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MinioStorageAdapter } from '../../../src/adapters/minio.adapter';
import { InvalidStorageObjectKeyError } from '../../../src/errors';
import { MAX_STORAGE_OBJECT_KEY_UTF8_BYTES } from '../../../src/assert';
import { minioIntegrationProvider, type StorageIntegrationContext } from '../providers';
import { createAsciiKeyAtLength } from '../helpers';

const uploadInBatches = async ({
  context,
  keys,
  batchSize
}: {
  context: StorageIntegrationContext;
  keys: string[];
  batchSize: number;
}) => {
  for (let index = 0; index < keys.length; index += batchSize) {
    await Promise.all(
      keys.slice(index, index + batchSize).map((key) =>
        context.storage.uploadObject({
          key,
          body: 'x',
          contentType: 'text/plain',
          contentLength: 1
        })
      )
    );
  }
};

const uploadAndHashMultipartFile = async ({
  context,
  key,
  totalSize,
  partSize,
  retryFirstPart = false
}: {
  context: StorageIntegrationContext;
  key: string;
  totalSize: number;
  partSize: number;
  retryFirstPart?: boolean;
}) => {
  const upload = await context.storage.createMultipartUpload({
    key,
    contentType: 'application/octet-stream',
    metadata: { uploadSource: 'minio-multipart-integration' }
  });
  const expectedHash = createHash('sha256');
  const parts = [];

  for (let offset = 0, partNumber = 1; offset < totalSize; partNumber += 1) {
    const length = Math.min(partSize, totalSize - offset);
    const body = Buffer.alloc(length, partNumber % 251);
    if (retryFirstPart && partNumber === 1) {
      await expect(
        context.storage.uploadMultipartPart({
          key,
          uploadId: upload.uploadId,
          partNumber,
          body: Readable.from(body),
          contentLength: 0
        })
      ).rejects.toThrow('Multipart contentLength must be a positive integer');
    }
    expectedHash.update(body);
    const result = await context.storage.uploadMultipartPart({
      key,
      uploadId: upload.uploadId,
      partNumber,
      body: Readable.from(body),
      contentLength: length
    });
    parts.push({ partNumber, etag: result.etag });
    offset += length;
  }

  await context.storage.completeMultipartUpload({
    key,
    uploadId: upload.uploadId,
    parts
  });

  const download = await context.storage.downloadObject({ key });
  const actualHash = createHash('sha256');
  let actualSize = 0;
  for await (const chunk of download.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    actualHash.update(buffer);
    actualSize += buffer.length;
  }

  return {
    actualSize,
    actualHash: actualHash.digest('hex'),
    expectedHash: expectedHash.digest('hex')
  };
};

describe.skipIf(!minioIntegrationProvider.enabled).sequential('MinIO-specific integration', () => {
  let context: StorageIntegrationContext;

  beforeAll(async () => {
    context = await minioIntegrationProvider.createContext();
  });

  afterAll(async () => {
    await context?.cleanup();
  });

  it('recreates the stable bucket and removes objects left by an interrupted run', async () => {
    const interruptedContext = context;
    const staleKey = `${interruptedContext.rootPrefix}stale/object.txt`;
    await interruptedContext.storage.uploadObject({ key: staleKey, body: 'stale' });
    await interruptedContext.storage.destroy();

    context = await minioIntegrationProvider.createContext();

    expect(context.bucket).toBe(interruptedContext.bucket);
    await expect(context.storage.listObjects({ prefix: staleKey })).resolves.toEqual({
      bucket: context.bucket,
      keys: []
    });
  });

  it('creates a missing bucket through MinioStorageAdapter', () => {
    expect(context.initialEnsureResult).toEqual({
      bucket: context.bucket,
      exists: false,
      created: true
    });
  });

  it('deletes 401 URL-sensitive keys across the 400-object prefix page boundary', async () => {
    const prefix = `${context.rootPrefix}prefix-page/team & +/`;
    const keys = Array.from({ length: 401 }, (_, index) => `${prefix}file + ${index}.txt`);
    await uploadInBatches({ context, keys, batchSize: 20 });

    const beforeDelete = await context.storage.listObjects({ prefix });
    expect(new Set(beforeDelete.keys)).toEqual(new Set(keys));
    await expect(context.storage.deleteObjectsByPrefix({ prefix })).resolves.toEqual({
      bucket: context.bucket,
      keys: []
    });
    await expect(context.storage.listObjects({ prefix })).resolves.toEqual({
      bucket: context.bucket,
      keys: []
    });
  });

  it('lists 1001 objects across pages and deletes them across 1000-key batches', async () => {
    const prefix = `${context.rootPrefix}list-page/`;
    const keys = Array.from({ length: 1001 }, (_, index) => `${prefix}${index}.txt`);
    await uploadInBatches({ context, keys, batchSize: 25 });

    const listed = await context.storage.listObjects({ prefix });
    expect(new Set(listed.keys)).toEqual(new Set(keys));
    await expect(context.storage.deleteObjectsByMultiKeys({ keys })).resolves.toEqual({
      bucket: context.bucket,
      keys: []
    });
    await expect(context.storage.listObjects({ prefix })).resolves.toEqual({
      bucket: context.bucket,
      keys: []
    });
  });

  it(`rejects an object key beyond the portable ${MAX_STORAGE_OBJECT_KEY_UTF8_BYTES}-byte limit without creating an object`, async () => {
    const prefix = `${context.rootPrefix}too-long/`;
    const key = createAsciiKeyAtLength({
      prefix,
      byteLength: MAX_STORAGE_OBJECT_KEY_UTF8_BYTES + 1
    });

    await expect(context.storage.uploadObject({ key, body: 'too-long' })).rejects.toMatchObject({
      name: InvalidStorageObjectKeyError.name,
      reason: 'too_long',
      actualBytes: MAX_STORAGE_OBJECT_KEY_UTF8_BYTES + 1,
      maxBytes: MAX_STORAGE_OBJECT_KEY_UTF8_BYTES
    });
    await expect(context.storage.listObjects({ prefix })).resolves.toEqual({
      bucket: context.bucket,
      keys: []
    });
  });

  it('grants anonymous GET without granting anonymous PUT', async () => {
    const storage = context.storage as MinioStorageAdapter;
    const key = `${context.rootPrefix}public/folder name/file #+.txt`;
    await storage.uploadObject({ key, body: 'public-content' });
    const publicUrl = storage.generatePublicGetUrl({ key }).url;

    const privateResponse = await fetch(publicUrl);
    expect(privateResponse.status).toBe(403);

    await storage.ensurePublicBucketPolicy();
    const publicResponse = await fetch(publicUrl);
    expect(publicResponse.ok).toBe(true);
    await expect(publicResponse.text()).resolves.toBe('public-content');

    const anonymousPut = await fetch(publicUrl, { method: 'PUT', body: 'overwritten' });
    expect(anonymousPut.status).toBe(403);
    const authenticatedDownload = await storage.downloadObject({ key });
    const chunks: Buffer[] = [];
    for await (const chunk of authenticatedDownload.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('public-content');
  });

  it.each([
    { label: '50 MiB', totalSize: 50 * 1024 * 1024 },
    { label: '500 MiB', totalSize: 500 * 1024 * 1024 }
  ])(
    'round-trips a $label Multipart object with a short final part',
    async ({ label, totalSize }) => {
      const key = `${context.rootPrefix}multipart/${label.replace(' ', '-')}.bin`;
      const result = await uploadAndHashMultipartFile({
        context,
        key,
        totalSize,
        partSize: 8 * 1024 * 1024,
        retryFirstPart: label === '50 MiB'
      });

      expect(result.actualSize).toBe(totalSize);
      expect(result.actualHash).toBe(result.expectedHash);
      await expect(context.storage.getObjectMetadata({ key })).resolves.toMatchObject({
        contentLength: totalSize
      });
    },
    10 * 60 * 1000
  );

  it('aborts an in-progress Multipart upload without leaving a final object', async () => {
    const storage = context.storage;
    const key = `${context.rootPrefix}multipart/cancelled.bin`;
    const upload = await storage.createMultipartUpload({ key });
    await storage.uploadMultipartPart({
      key,
      uploadId: upload.uploadId,
      partNumber: 1,
      body: Readable.from(Buffer.alloc(8 * 1024 * 1024, 0x33)),
      contentLength: 8 * 1024 * 1024
    });

    await storage.abortMultipartUpload({ key, uploadId: upload.uploadId });
    await expect(storage.checkObjectExists({ key })).resolves.toMatchObject({ exists: false });
  });
});
