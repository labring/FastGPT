import * as http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CosStorageAdapter } from '../../../src/adapters/cos.adapter';
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

const createStalledObjectServer = () => {
  const sockets = new Set<Socket>();
  let notifyRequest: (() => void) | undefined;
  const requestReceived = new Promise<void>((resolve) => {
    notifyRequest = resolve;
  });
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Length': '100',
      'Content-Type': 'application/octet-stream'
    });
    response.write('partial');
    notifyRequest?.();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  return { server, sockets, requestReceived };
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

describe('provider download abort transport integration', () => {
  it('closes the OSS response socket when the caller aborts an in-flight stream', async () => {
    const { server, sockets, requestReceived } = createStalledObjectServer();
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
    const controller = new AbortController();
    const abortReason = new Error('client aborted');
    const { body } = await storage.downloadObject({
      key: 'abort/file.bin',
      abortSignal: controller.signal
    });
    body.on('error', () => {});
    const streamClosed = new Promise<void>((resolve) => body.once('close', resolve));
    await withTimeout(requestReceived, 'OSS request did not reach the local server');

    controller.abort(abortReason);

    await withTimeout(streamClosed, 'OSS stream did not close after abort');
    expect(body.errored).toBe(abortReason);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('aborts the COS request when the caller aborts its output stream', async () => {
    const { server, sockets, requestReceived } = createStalledObjectServer();
    const port = await listen(server);
    const storage = new CosStorageAdapter({
      vendor: 'cos',
      bucket: 'test-bucket-1250000000',
      region: 'ap-guangzhou',
      protocol: 'http:',
      domain: `127.0.0.1:${port}`,
      credentials: { accessKeyId: 'secret-id', secretAccessKey: 'secret-key' }
    });
    const controller = new AbortController();
    const abortReason = new Error('client aborted');
    const { body } = await storage.downloadObject({
      key: 'abort/file.bin',
      abortSignal: controller.signal
    });
    body.on('error', () => {});
    const streamClosed = new Promise<void>((resolve) => body.once('close', resolve));
    await withTimeout(requestReceived, 'COS request did not reach the local server');

    controller.abort(abortReason);

    await withTimeout(streamClosed, 'COS stream did not close after abort');
    expect(body.errored).toBe(abortReason);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });
});
