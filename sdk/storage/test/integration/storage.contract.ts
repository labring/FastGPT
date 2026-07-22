import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MinioStorageAdapter } from '../../src/adapters/minio.adapter';
import type {
  StorageIntegrationContext,
  StorageIntegrationProvider
} from './providers';

const readBody = async (body: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

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

/**
 * 对任意 IStorage 实现执行相同的外部行为契约。
 * Provider 只负责环境和 bucket 生命周期，断言不依赖厂商 SDK。
 */
export const runStorageAdapterContract = (provider: StorageIntegrationProvider) => {
  describe.skipIf(!provider.enabled).sequential(`${provider.name} IStorage integration contract`, () => {
    let context: StorageIntegrationContext;

    beforeAll(async () => {
      context = await provider.createContext();
    });

    afterAll(async () => {
      await context?.cleanup();
    });

    it('creates a dedicated bucket and reports it through the interface', async () => {
      expect(context.bucket).toMatch(/^fastgpt-sdk-/);
      expect(context.storage.bucketName).toBe(context.bucket);
      expect(context.initialEnsureResult).toMatchObject({ bucket: context.bucket });
      expect(
        context.initialEnsureResult.created || context.initialEnsureResult.exists
      ).toBe(true);

      await expect(context.storage.ensureBucket()).resolves.toEqual({
        bucket: context.bucket,
        exists: true,
        created: false
      });
    });

    it('uploads, checks, downloads and reads metadata for an object', async () => {
      const key = `${context.rootPrefix}object/basic.txt`;
      const content = Buffer.from('FastGPT storage integration');

      await expect(
        context.storage.uploadObject({
          key,
          body: content,
          contentType: 'text/plain',
          contentLength: content.length,
          contentDisposition: 'attachment; filename="basic.txt"',
          metadata: { traceId: 'contract-basic' }
        })
      ).resolves.toEqual({ bucket: context.bucket, key });

      await expect(context.storage.checkObjectExists({ key })).resolves.toEqual({
        bucket: context.bucket,
        key,
        exists: true
      });

      const metadata = await context.storage.getObjectMetadata({ key });
      expect(metadata).toMatchObject({
        bucket: context.bucket,
        key,
        contentType: 'text/plain',
        contentLength: content.length,
        metadata: { traceId: 'contract-basic' }
      });
      expect(metadata.etag).toBeTruthy();

      const download = await context.storage.downloadObject({ key });
      expect(download).toMatchObject({ bucket: context.bucket, key });
      await expect(readBody(download.body)).resolves.toEqual(content);
    });

    it('accepts Readable and string upload bodies', async () => {
      const streamKey = `${context.rootPrefix}upload/stream.txt`;
      const stringKey = `${context.rootPrefix}upload/string.txt`;

      await context.storage.uploadObject({
        key: streamKey,
        body: Readable.from(['stream-', 'body']),
        contentType: 'text/plain'
      });
      await context.storage.uploadObject({
        key: stringKey,
        body: 'string-body',
        contentType: 'text/plain',
        contentLength: 11
      });

      const streamDownload = await context.storage.downloadObject({ key: streamKey });
      const stringDownload = await context.storage.downloadObject({ key: stringKey });
      await expect(readBody(streamDownload.body)).resolves.toEqual(Buffer.from('stream-body'));
      await expect(readBody(stringDownload.body)).resolves.toEqual(Buffer.from('string-body'));
    });

    it('lists and copies keys containing path and URL-sensitive characters', async () => {
      const sourceKey = `${context.rootPrefix}special/team & +/%25/\u6587\u4ef6.txt`;
      const targetKey = `${context.rootPrefix}special/copied file.txt`;
      await context.storage.uploadObject({ key: sourceKey, body: 'special-content' });

      const listed = await context.storage.listObjects({
        prefix: `${context.rootPrefix}special/`
      });
      expect(listed.bucket).toBe(context.bucket);
      expect(listed.keys).toContain(sourceKey);

      await expect(
        context.storage.copyObjectInSelfBucket({ sourceKey, targetKey })
      ).resolves.toEqual({ bucket: context.bucket, sourceKey, targetKey });
      const copied = await context.storage.downloadObject({ key: targetKey });
      await expect(readBody(copied.body)).resolves.toEqual(Buffer.from('special-content'));
    });

    it('uploads and downloads through presigned URLs', async () => {
      const key = `${context.rootPrefix}presigned/file.txt`;
      const content = 'presigned-content';
      const put = await context.storage.generatePresignedPutUrl({
        key,
        expiredSeconds: 300,
        contentType: 'text/plain',
        metadata: { uploadSource: 'contract' }
      });
      expect(put).toMatchObject({ bucket: context.bucket, key });
      expect(() => new URL(put.url)).not.toThrow();

      const putResponse = await fetch(put.url, {
        method: 'PUT',
        headers: put.metadata,
        body: content
      });
      expect(putResponse.ok).toBe(true);

      const get = await context.storage.generatePresignedGetUrl({
        key,
        expiredSeconds: 300,
        responseContentType: 'text/plain'
      });
      expect(get).toMatchObject({ bucket: context.bucket, key });
      const getResponse = await fetch(get.url);
      expect(getResponse.ok).toBe(true);
      expect(getResponse.headers.get('content-type')).toContain('text/plain');
      await expect(getResponse.text()).resolves.toBe(content);
    });

    it('generates a public URL without performing I/O', () => {
      const key = `${context.rootPrefix}public/file.txt`;
      const result = context.storage.generatePublicGetUrl({ key });

      expect(result).toMatchObject({ bucket: context.bucket, key });
      expect(() => new URL(result.url)).not.toThrow();
    });

    it('deletes a single object idempotently', async () => {
      const key = `${context.rootPrefix}delete/single.txt`;
      await context.storage.uploadObject({ key, body: 'delete-me' });

      await expect(context.storage.deleteObject({ key })).resolves.toEqual({
        bucket: context.bucket,
        key
      });
      await expect(context.storage.deleteObject({ key })).resolves.toEqual({
        bucket: context.bucket,
        key
      });
      await expect(context.storage.checkObjectExists({ key })).resolves.toMatchObject({
        exists: false
      });
    });

    it('deletes multiple keys and treats an empty list as a no-op', async () => {
      await expect(context.storage.deleteObjectsByMultiKeys({ keys: [] })).resolves.toEqual({
        bucket: context.bucket,
        keys: []
      });

      const keys = [
        `${context.rootPrefix}delete/multi-1.txt`,
        `${context.rootPrefix}delete/multi-2.txt`,
        `${context.rootPrefix}delete/multi-3.txt`
      ];
      await Promise.all(keys.map((key) => context.storage.uploadObject({ key, body: key })));

      await expect(context.storage.deleteObjectsByMultiKeys({ keys })).resolves.toEqual({
        bucket: context.bucket,
        keys: []
      });
      const checks = await Promise.all(
        keys.map((key) => context.storage.checkObjectExists({ key }))
      );
      expect(checks.every(({ exists }) => !exists)).toBe(true);
    });

    it('rejects an empty prefix and deletes only matching objects', async () => {
      for (const prefix of ['', '   ']) {
        await expect(context.storage.deleteObjectsByPrefix({ prefix })).rejects.toThrow(
          'Prefix is required'
        );
      }

      const prefix = `${context.rootPrefix}delete-prefix/target/`;
      const targetKeys = [`${prefix}first.txt`, `${prefix}second.txt`];
      const siblingKey = `${context.rootPrefix}delete-prefix/sibling.txt`;
      await Promise.all(
        [...targetKeys, siblingKey].map((key) =>
          context.storage.uploadObject({ key, body: 'prefix-delete' })
        )
      );

      await expect(context.storage.deleteObjectsByPrefix({ prefix })).resolves.toEqual({
        bucket: context.bucket,
        keys: []
      });
      await expect(context.storage.listObjects({ prefix })).resolves.toEqual({
        bucket: context.bucket,
        keys: []
      });
      await expect(context.storage.checkObjectExists({ key: siblingKey })).resolves.toMatchObject({
        exists: true
      });
    });

    it('rejects reads for a missing object', async () => {
      const key = `${context.rootPrefix}missing/not-found.txt`;
      await expect(context.storage.downloadObject({ key })).rejects.toBeTruthy();
      await expect(context.storage.getObjectMetadata({ key })).rejects.toBeTruthy();
      await expect(context.storage.checkObjectExists({ key })).resolves.toMatchObject({
        bucket: context.bucket,
        key,
        exists: false
      });
    });

    it.skipIf(provider.name !== 'minio')(
      'deletes 401 URL-sensitive MinIO keys across the adapter page boundary',
      async () => {
        const prefix = `${context.rootPrefix}minio-page/team & +/`;
        const keys = Array.from({ length: 401 }, (_, index) => `${prefix}file + ${index}.txt`);
        await uploadInBatches({ context, keys, batchSize: 20 });

        const beforeDelete = await context.storage.listObjects({ prefix });
        expect(beforeDelete.keys).toHaveLength(401);
        await expect(context.storage.deleteObjectsByPrefix({ prefix })).resolves.toEqual({
          bucket: context.bucket,
          keys: []
        });
        await expect(context.storage.listObjects({ prefix })).resolves.toEqual({
          bucket: context.bucket,
          keys: []
        });
      }
    );

    it.skipIf(provider.name !== 'minio')(
      'applies MinIO public-read policy and removes an absent lifecycle',
      async () => {
        const minioStorage = context.storage as MinioStorageAdapter;
        const key = `${context.rootPrefix}minio-public/file.txt`;
        await minioStorage.uploadObject({ key, body: 'public-content' });
        await minioStorage.ensurePublicBucketPolicy();

        const publicUrl = minioStorage.generatePublicGetUrl({ key }).url;
        const publicResponse = await fetch(publicUrl);
        expect(publicResponse.ok).toBe(true);
        await expect(publicResponse.text()).resolves.toBe('public-content');
        await expect(minioStorage.removeBucketLifecycle()).resolves.toBeUndefined();
      }
    );
  });
};
