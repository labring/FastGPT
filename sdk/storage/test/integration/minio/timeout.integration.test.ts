import * as http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMinioTimeoutTransport,
  MinioStorageAdapter
} from '../../../src/adapters/minio.adapter';

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

const withTimeout = async <T>(promise: Promise<T>, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 1000);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

afterEach(async () => {
  await Promise.all([...servers].map(closeServer));
});

describe('MinIO timeout transport integration', () => {
  it('destroys a real socket when the server never sends response headers', async () => {
    const sockets = new Set<Socket>();
    const server = http.createServer(() => {});
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    const port = await listen(server);
    const transport = createMinioTimeoutTransport({ transport: http, timeoutMs: 50 });

    const error = await new Promise<Error>((resolve, reject) => {
      const request = transport.request({ host: '127.0.0.1', port, path: '/' });
      request.once('error', resolve);
      request.once('response', () => reject(new Error('Unexpected response')));
      request.end();
    });

    expect(error.message).toBe('MinIO request timeout after 50ms');
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await closeServer(server);
  });

  it('destroys a real socket when the response body never completes', async () => {
    const sockets = new Set<Socket>();
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Length': '100' });
      response.write('partial');
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    const port = await listen(server);
    const transport = createMinioTimeoutTransport({ transport: http, timeoutMs: 50 });
    let responseComplete: boolean | undefined;

    await new Promise<void>((resolve, reject) => {
      const request = transport.request({ host: '127.0.0.1', port, path: '/' }, (response) => {
        response.resume();
        response.once('end', () => reject(new Error('Unexpected complete response')));
        response.once('error', () => {
          responseComplete = response.complete;
          resolve();
        });
        response.once('aborted', () => {
          responseComplete = response.complete;
          resolve();
        });
      });
      request.once('error', () => {});
      request.end();
    });

    expect(responseComplete).toBe(false);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await closeServer(server);
  });

  it('closes a real download socket when the caller aborts after response headers', async () => {
    const sockets = new Set<Socket>();
    const server = http.createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Length': '100',
        'Content-Type': 'application/octet-stream'
      });
      response.write('partial');
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    const port = await listen(server);
    const storage = new MinioStorageAdapter({
      vendor: 'minio',
      bucket: 'test-bucket',
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      maxRetries: 1,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
    });
    const controller = new AbortController();
    const { body } = await storage.downloadObject({
      key: 'abort/file.bin',
      abortSignal: controller.signal
    });
    body.on('error', () => {});
    const streamClosed = new Promise<void>((resolve) => body.once('close', resolve));

    controller.abort(new Error('client aborted'));

    await streamClosed;
    expect(body.destroyed).toBe(true);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('aborts a real AWS-compatible request while waiting for response headers', async () => {
    const sockets = new Set<Socket>();
    let notifyRequest: (() => void) | undefined;
    const requestReceived = new Promise<void>((resolve) => {
      notifyRequest = resolve;
    });
    const server = http.createServer(() => notifyRequest?.());
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    const port = await listen(server);
    const storage = new MinioStorageAdapter({
      vendor: 'minio',
      bucket: 'test-bucket',
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      maxRetries: 1,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
    });
    const controller = new AbortController();
    const downloadPromise = storage.downloadObject({
      key: 'abort/waiting-for-headers.bin',
      abortSignal: controller.signal
    });
    await withTimeout(requestReceived, 'AWS-compatible request did not reach the local server');

    controller.abort(new Error('client aborted'));

    await expect(downloadPromise).rejects.toMatchObject({ name: 'AbortError' });
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });
});
