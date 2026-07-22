import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StorageIntegrationContext, StorageIntegrationProvider } from '../providers';
import { createAsciiKeyAtLength } from '../helpers';

const readBody = async (body: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

/**
 * 对任意 IStorage 实现执行相同的外部行为契约。
 * Provider 只负责环境和 bucket 生命周期，断言不依赖厂商 SDK。
 */
export const runStorageAdapterContract = (provider: StorageIntegrationProvider) => {
  describe
    .skipIf(!provider.enabled)
    .sequential(`${provider.name} IStorage integration contract`, () => {
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
        expect(context.initialEnsureResult.created || context.initialEnsureResult.exists).toBe(
          true
        );

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

      it('round-trips zero-byte and binary objects without coercing content', async () => {
        const emptyKey = `${context.rootPrefix}binary/empty.bin`;
        const binaryKey = `${context.rootPrefix}binary/raw.bin`;
        const binaryContent = Buffer.from([0, 255, 1, 128, 13, 10, 0]);

        await context.storage.uploadObject({
          key: emptyKey,
          body: Buffer.alloc(0),
          contentType: 'application/octet-stream',
          contentLength: 0
        });
        await context.storage.uploadObject({
          key: binaryKey,
          body: binaryContent,
          contentType: 'application/octet-stream',
          contentLength: binaryContent.length
        });

        const emptyDownload = await context.storage.downloadObject({ key: emptyKey });
        const binaryDownload = await context.storage.downloadObject({ key: binaryKey });
        await expect(readBody(emptyDownload.body)).resolves.toEqual(Buffer.alloc(0));
        await expect(readBody(binaryDownload.body)).resolves.toEqual(binaryContent);
        await expect(context.storage.getObjectMetadata({ key: emptyKey })).resolves.toMatchObject({
          contentLength: 0,
          contentType: 'application/octet-stream'
        });
      });

      it('atomically overwrites object content and metadata at the same key', async () => {
        const key = `${context.rootPrefix}overwrite/file.txt`;
        await context.storage.uploadObject({
          key,
          body: 'old-content',
          metadata: { revision: 'old', removedAfterOverwrite: 'true' }
        });
        await context.storage.uploadObject({
          key,
          body: 'new-content',
          metadata: { revision: 'new' }
        });

        const download = await context.storage.downloadObject({ key });
        await expect(readBody(download.body)).resolves.toEqual(Buffer.from('new-content'));
        const metadata = await context.storage.getObjectMetadata({ key });
        expect(metadata.metadata).toMatchObject({ revision: 'new' });
        expect(metadata.metadata).not.toHaveProperty('removedAfterOverwrite');
      });

      it('isolates concurrent uploads and downloads under one prefix', async () => {
        const prefix = `${context.rootPrefix}concurrent/`;
        const entries = Array.from({ length: 20 }, (_, index) => ({
          key: `${prefix}${index}.txt`,
          content: `content-${index}`
        }));
        await Promise.all(
          entries.map(({ key, content }) => context.storage.uploadObject({ key, body: content }))
        );

        const listed = await context.storage.listObjects({ prefix });
        expect(new Set(listed.keys)).toEqual(new Set(entries.map(({ key }) => key)));
        const contents = await Promise.all(
          entries.map(async ({ key }) => {
            const download = await context.storage.downloadObject({ key });
            return (await readBody(download.body)).toString();
          })
        );
        expect(contents).toEqual(entries.map(({ content }) => content));
      });

      it('round-trips and deletes a portable 512-byte object key', async () => {
        const keyPrefix = `${context.rootPrefix}long-key/`;
        const key = createAsciiKeyAtLength({ prefix: keyPrefix, byteLength: 512 });
        expect(Buffer.byteLength(key)).toBe(512);

        await context.storage.uploadObject({ key, body: 'long-key-content' });
        await expect(context.storage.checkObjectExists({ key })).resolves.toMatchObject({
          exists: true
        });
        const download = await context.storage.downloadObject({ key });
        await expect(readBody(download.body)).resolves.toEqual(Buffer.from('long-key-content'));
        await expect(context.storage.deleteObject({ key })).resolves.toEqual({
          bucket: context.bucket,
          key
        });
        await expect(context.storage.checkObjectExists({ key })).resolves.toMatchObject({
          exists: false
        });
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

      it('generates a public URL that preserves reserved characters inside the key path', () => {
        const key = `${context.rootPrefix}public/folder name/file #+&.txt`;
        const result = context.storage.generatePublicGetUrl({ key });

        expect(result).toMatchObject({ bucket: context.bucket, key });
        const url = new URL(result.url);
        expect(decodeURIComponent(url.pathname).endsWith(`/${key}`)).toBe(true);
        expect(url.hash).toBe('');
      });

      it('rejects a download that was aborted before dispatch', async () => {
        const key = `${context.rootPrefix}abort/file.txt`;
        await context.storage.uploadObject({ key, body: 'abort-content' });
        const controller = new AbortController();
        controller.abort();

        await expect(
          context.storage.downloadObject({ key, abortSignal: controller.signal })
        ).rejects.toMatchObject({ name: 'AbortError' });
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

      it('treats missing keys in batch and prefix deletion as successful no-ops', async () => {
        const existingKey = `${context.rootPrefix}delete-missing/existing.txt`;
        const missingKey = `${context.rootPrefix}delete-missing/missing.txt`;
        await context.storage.uploadObject({ key: existingKey, body: 'existing' });

        await expect(
          context.storage.deleteObjectsByMultiKeys({ keys: [existingKey, missingKey] })
        ).resolves.toEqual({ bucket: context.bucket, keys: [] });
        await expect(
          context.storage.deleteObjectsByPrefix({
            prefix: `${context.rootPrefix}delete-missing/never-created/`
          })
        ).resolves.toEqual({ bucket: context.bucket, keys: [] });
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
        await expect(context.storage.checkObjectExists({ key: siblingKey })).resolves.toMatchObject(
          {
            exists: true
          }
        );
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

      it('returns an empty list for an unmatched prefix', async () => {
        await expect(
          context.storage.listObjects({ prefix: `${context.rootPrefix}not-present/` })
        ).resolves.toEqual({ bucket: context.bucket, keys: [] });
      });

      it('allows independently created adapters to be destroyed repeatedly', async () => {
        const isolatedStorage = context.createStorage();
        await expect(isolatedStorage.ensureBucket()).resolves.toMatchObject({
          bucket: context.bucket,
          exists: true
        });
        await expect(isolatedStorage.destroy()).resolves.toBeUndefined();
        await expect(isolatedStorage.destroy()).resolves.toBeUndefined();
      });
    });
};
