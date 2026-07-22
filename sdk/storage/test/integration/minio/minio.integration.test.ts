import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MinioStorageAdapter } from '../../../src/adapters/minio.adapter';
import { InvalidStorageObjectKeyError } from '../../../src/errors';
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

  it('rejects an object key beyond the portable 850-byte limit without creating an object', async () => {
    const prefix = `${context.rootPrefix}too-long/`;
    const key = createAsciiKeyAtLength({ prefix, byteLength: 851 });

    await expect(context.storage.uploadObject({ key, body: 'too-long' })).rejects.toMatchObject({
      name: InvalidStorageObjectKeyError.name,
      reason: 'too_long',
      actualBytes: 851,
      maxBytes: 850
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

  it('removes bucket lifecycle when no lifecycle configuration exists', async () => {
    const storage = context.storage as MinioStorageAdapter;
    await expect(storage.removeBucketLifecycle()).resolves.toBeUndefined();
  });
});
