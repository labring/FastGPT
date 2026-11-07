import * as http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { AwsS3StorageAdapter } from '../../../src/adapters/aws-s3.adapter';
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
  const server = http.createServer((request, response) => {
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'Content-Length': '0',
        'Content-Type': 'application/octet-stream'
      });
      response.end();
      return;
    }

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

const createStalledUploadServer = () => {
  const sockets = new Set<Socket>();
  let notifyRequest: (() => void) | undefined;
  const requestReceived = new Promise<void>((resolve) => {
    notifyRequest = resolve;
  });
  const server = http.createServer(() => {
    // Keep the request open without a response so cancellation is observable.
    notifyRequest?.();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  return { server, sockets, requestReceived };
};

const createReadBodyStalledServer = () => {
  const sockets = new Set<Socket>();
  let notifyRequest: (() => void) | undefined;
  const requestReceived = new Promise<void>((resolve) => {
    notifyRequest = resolve;
  });
  const server = http.createServer((request) => {
    // Consume the request body, then keep the response open to model provider latency.
    request.resume();
    request.on('end', () => notifyRequest?.());
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  return { server, sockets, requestReceived };
};

const createMultipartStalledServer = () => {
  const sockets = new Set<Socket>();
  let notifyPart: (() => void) | undefined;
  const partReceived = new Promise<void>((resolve) => {
    notifyPart = resolve;
  });
  let notifyAbort: (() => void) | undefined;
  const abortReceived = new Promise<void>((resolve) => {
    notifyAbort = resolve;
  });
  let resolvePartClosed: (() => void) | undefined;
  const partClosed = new Promise<void>((resolve) => {
    resolvePartClosed = resolve;
  });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'POST' && url.searchParams.has('uploads')) {
      request.resume();
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end(
        '<InitiateMultipartUploadResult><Bucket>test-bucket</Bucket><Key>abort/upload.bin</Key><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>'
      );
      return;
    }
    if (request.method === 'DELETE') {
      request.resume();
      notifyAbort?.();
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === 'PUT' && url.searchParams.get('partNumber') === '1') {
      request.socket.once('close', () => resolvePartClosed?.());
      request.resume();
      notifyPart?.();
      return;
    }
    request.resume();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  return { server, sockets, partReceived, partClosed, abortReceived };
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

describe('provider upload abort transport integration', () => {
  it('closes the COS upload socket when the caller aborts an in-flight upload', async () => {
    const { server, sockets, requestReceived } = createStalledUploadServer();
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
    const body = new PassThrough();
    const uploadPromise = storage.uploadObject({
      key: 'abort/upload.bin',
      body,
      contentLength: 4,
      abortSignal: controller.signal
    });
    body.write(Buffer.from('test'));
    const uploadSettled = uploadPromise.then(
      () => undefined,
      (error) => error
    );
    await withTimeout(requestReceived, 'COS upload did not reach the local server');

    controller.abort(abortReason);

    const error = await withTimeout(uploadSettled, 'COS upload did not settle after abort');
    expect(error).toBe(abortReason);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('closes the OSS upload socket when the caller aborts an in-flight upload', async () => {
    const { server, sockets, requestReceived } = createStalledUploadServer();
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
    const body = new PassThrough();
    const uploadPromise = storage.uploadObject({
      key: 'abort/upload.bin',
      body,
      abortSignal: controller.signal
    });
    body.write(Buffer.from('test'));
    const uploadSettled = uploadPromise.then(
      () => undefined,
      (error) => error
    );
    await withTimeout(requestReceived, 'OSS upload did not reach the local server');

    controller.abort(abortReason);

    const error = await withTimeout(uploadSettled, 'OSS upload did not settle after abort');
    expect(error).toBe(abortReason);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('closes the COS socket when aborting after the body has been sent', async () => {
    const { server, sockets, requestReceived } = createReadBodyStalledServer();
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
    const uploadPromise = storage.uploadObject({
      key: 'abort/upload.bin',
      body: Buffer.from('test'),
      contentLength: 4,
      abortSignal: controller.signal
    });
    const uploadSettled = uploadPromise.then(
      () => undefined,
      (error) => error
    );
    await withTimeout(requestReceived, 'COS upload body was not sent');

    controller.abort(abortReason);

    const error = await withTimeout(uploadSettled, 'COS upload did not settle after abort');
    expect(error).toBe(abortReason);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('closes the OSS socket when aborting after the body has been sent', async () => {
    const { server, sockets, requestReceived } = createReadBodyStalledServer();
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
    const uploadPromise = storage.uploadObject({
      key: 'abort/upload.bin',
      body: Buffer.from('test'),
      contentLength: 4,
      abortSignal: controller.signal
    });
    const uploadSettled = uploadPromise.then(
      () => undefined,
      (error) => error
    );
    await withTimeout(requestReceived, 'OSS upload body was not sent');

    controller.abort(abortReason);

    const error = await withTimeout(uploadSettled, 'OSS upload did not settle after abort');
    expect(error).toBe(abortReason);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('closes the AWS upload socket and destroys the input stream on abort', async () => {
    const { server, sockets, requestReceived } = createReadBodyStalledServer();
    const port = await listen(server);
    const storage = new AwsS3StorageAdapter({
      vendor: 'aws-s3',
      bucket: 'test-bucket',
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      maxRetries: 1,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
    });
    const controller = new AbortController();
    const body = new PassThrough({ autoDestroy: false });
    const uploadPromise = storage.uploadObject({
      key: 'abort/upload.bin',
      body,
      contentLength: 4,
      abortSignal: controller.signal
    });
    const uploadSettled = uploadPromise.then(
      () => undefined,
      (error) => error
    );
    body.end(Buffer.from('test'));
    await withTimeout(requestReceived, 'AWS upload body was not sent');

    controller.abort(new Error('client aborted'));

    const error = await withTimeout(uploadSettled, 'AWS upload did not settle after abort');
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(body.destroyed).toBe(true);
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0);
    await storage.destroy();
    await closeServer(server);
  });

  it('aborts an in-flight AWS multipart part and closes its socket', async () => {
    const { server, partReceived, partClosed, abortReceived } = createMultipartStalledServer();
    const port = await listen(server);
    const storage = new AwsS3StorageAdapter({
      vendor: 'aws-s3',
      bucket: 'test-bucket',
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      maxRetries: 1,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' }
    });
    const controller = new AbortController();
    const body = new PassThrough({ autoDestroy: false });
    const uploadPromise = storage.uploadObject({
      key: 'abort/upload.bin',
      body,
      contentLength: 6 * 1024 * 1024,
      abortSignal: controller.signal
    });
    const uploadSettled = uploadPromise.then(
      () => undefined,
      (error) => error
    );
    body.write(Buffer.alloc(6 * 1024 * 1024));
    await withTimeout(partReceived, 'AWS multipart part did not reach the local server');

    controller.abort(new Error('client aborted'));

    const error = await withTimeout(
      uploadSettled,
      'AWS multipart upload did not settle after abort'
    );
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(body.destroyed).toBe(true);
    await withTimeout(partClosed, 'AWS multipart part socket did not close after abort');
    await withTimeout(abortReceived, 'AWS did not send AbortMultipartUpload after cancel');
    await storage.destroy();
    await closeServer(server);
  });
});
