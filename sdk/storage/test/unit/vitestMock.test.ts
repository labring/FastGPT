import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createVitestStorageMock } from '../../src/testing/vitestMock';

const readBody = async (body: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

describe('createVitestStorageMock', () => {
  it('implements bucket lifecycle, upload forms, download and metadata', async () => {
    const storage = createVitestStorageMock({ vi, bucketName: 'test-bucket' });
    await expect(storage.ensureBucket()).resolves.toEqual({
      bucket: 'test-bucket',
      exists: false,
      created: true
    });
    await expect(storage.ensureBucket()).resolves.toEqual({
      bucket: 'test-bucket',
      exists: true,
      created: false
    });

    await storage.uploadObject({
      key: 'buffer.bin',
      body: Buffer.from([0, 255]),
      metadata: { source: 'buffer' }
    });
    await storage.uploadObject({ key: 'string.txt', body: 'string' });
    await storage.uploadObject({ key: 'stream.txt', body: Readable.from(['stream']) });

    const download = await storage.downloadObject({ key: 'buffer.bin' });
    await expect(readBody(download.body)).resolves.toEqual(Buffer.from([0, 255]));
    await expect(storage.getObjectMetadata({ key: 'buffer.bin' })).resolves.toMatchObject({
      metadata: { source: 'buffer' },
      contentLength: 2,
      etag: expect.any(String)
    });
    await expect(storage.listObjects({})).resolves.toMatchObject({
      keys: ['buffer.bin', 'stream.txt', 'string.txt']
    });
  });

  it('returns failed keys rather than deleted keys from successful deletion methods', async () => {
    const storage = createVitestStorageMock({ vi });
    storage.__putObject('prefix/first.txt', { body: Buffer.from('first') });
    storage.__putObject('prefix/second.txt', { body: Buffer.from('second') });

    await expect(
      storage.deleteObjectsByMultiKeys({ keys: ['prefix/first.txt', 'missing.txt'] })
    ).resolves.toEqual({ bucket: 'mock-bucket', keys: [] });
    await expect(storage.deleteObjectsByPrefix({ prefix: 'prefix/' })).resolves.toEqual({
      bucket: 'mock-bucket',
      keys: []
    });
    expect(storage.__objects.size).toBe(0);
  });

  it('rejects empty prefixes and pre-aborted downloads', async () => {
    const storage = createVitestStorageMock({ vi });
    storage.__putObject('file.txt', { body: Buffer.from('file') });
    await expect(storage.deleteObjectsByPrefix({ prefix: '   ' })).rejects.toThrow(
      'prefix must be a non-empty string'
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      storage.downloadObject({ key: 'file.txt', abortSignal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('copies object buffers independently and resets state', async () => {
    const storage = createVitestStorageMock({ vi });
    storage.__putObject('source.txt', {
      body: Buffer.from('source'),
      metadata: { copied: 'true' }
    });
    await storage.copyObjectInSelfBucket({
      sourceKey: 'source.txt',
      targetKey: 'target.txt'
    });

    storage.__objects.get('source.txt')?.body.fill(0);
    expect(storage.__objects.get('target.txt')?.body.toString()).toBe('source');
    expect(storage.__objects.get('target.txt')?.metadata).toEqual({ copied: 'true' });
    storage.__reset();
    expect(storage.__objects.size).toBe(0);
  });

  it('encodes keys and response overrides in generated URLs', async () => {
    const storage = createVitestStorageMock({ vi, baseUrl: 'https://storage.test' });
    const key = 'folder name/file#+.txt';

    await expect(storage.generatePresignedPutUrl({ key })).resolves.toMatchObject({
      url: `https://storage.test/put/mock-bucket/${encodeURIComponent(key)}`
    });
    await expect(
      storage.generatePresignedGetUrl({ key, responseContentType: 'text/plain; charset=utf-8' })
    ).resolves.toMatchObject({
      url: expect.stringContaining('response-content-type=text%2Fplain%3B%20charset%3Dutf-8')
    });
    expect(storage.generatePublicGetUrl({ key }).url).toBe(
      `https://storage.test/public/mock-bucket/${encodeURIComponent(key)}`
    );
  });
});
