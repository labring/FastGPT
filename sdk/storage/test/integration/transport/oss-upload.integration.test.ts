import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { OssStorageAdapter } from '../../../src/adapters/oss.adapter';

const servers = new Set<http.Server>();

const listen = async (server: http.Server): Promise<number> => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.add(server);
  return (server.address() as AddressInfo).port;
};

const closeServer = async (server: http.Server) => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  servers.delete(server);
};

afterEach(async () => {
  await Promise.all([...servers].map(closeServer));
});

describe('OSS stream upload transport', () => {
  it('keeps Content-Length without adding Transfer-Encoding for known-length streams', async () => {
    let receivedHeaders: http.IncomingHttpHeaders | undefined;
    const receivedChunks: Buffer[] = [];
    const server = http.createServer((request, response) => {
      receivedHeaders = request.headers;
      request.on('data', (chunk) => receivedChunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        response.writeHead(200, { ETag: '"test-etag"' });
        response.end();
      });
    });
    const port = await listen(server);
    const storage = new OssStorageAdapter({
      vendor: 'oss',
      bucket: 'test-bucket',
      region: 'oss-cn-hangzhou',
      endpoint: `http://127.0.0.1:${port}`,
      cname: true,
      secure: false,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
    });

    try {
      const body = new PassThrough();
      const uploadPromise = storage.uploadObject({
        key: 'upload/file.bin',
        body,
        contentLength: 4
      });
      body.end(Buffer.from('test'));

      await expect(uploadPromise).resolves.toMatchObject({
        bucket: 'test-bucket',
        key: 'upload/file.bin'
      });
      expect(receivedHeaders?.['content-length']).toBe('4');
      expect(receivedHeaders?.['transfer-encoding']).toBeUndefined();
      expect(Buffer.concat(receivedChunks).toString()).toBe('test');
    } finally {
      await storage.destroy();
    }
  });
});
