import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FastGPT } from '../src/client';
import { FastGPTError } from '../src/error';
import { datasetOperations } from '../src/dataset/operations';
import type { DatasetOperation, DatasetOutput } from '../src/dataset/type';

const apiKey = 'test-fastgpt-api-key';
type RequestRecord = {
  url: string;
  method: string;
  authorization?: string;
  cookie?: string;
  contentType?: string;
  body: Buffer;
};
const requests: RequestRecord[] = [];
let respond: (req: IncomingMessage, res: ServerResponse) => void;
let baseURL: string;
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  requests.push({
    url: req.url!,
    method: req.method!,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
    contentType: req.headers['content-type'],
    body: Buffer.concat(chunks)
  });
  respond(req, res);
});

const json = (res: ServerResponse, data: unknown, status = 200, code = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'x-request-id': 'request-123' });
  res.end(JSON.stringify({ code, data, message: code === 200 ? '' : `Key ${apiKey} is expired` }));
};

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/prefix`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  requests.length = 0;
  respond = (_req, res) => json(res, { list: [], total: 0 });
});

describe('API Key transport', () => {
  it('fills dataset creation defaults on the client without mutating the caller input', async () => {
    const input = { name: 'Docs' };
    await new FastGPT({ baseURL, apiKey }).datasets.create(input);
    expect(JSON.parse(requests[0].body.toString())).toEqual({
      name: 'Docs',
      type: 'dataset',
      intro: ''
    });
    expect(input).toEqual({ name: 'Docs' });
  });
  it('uses Bearer authentication for JSON, query and multipart requests without cookies', async () => {
    const client = new FastGPT({ baseURL: `${baseURL}/api/`, apiKey });
    await client.datasets.list({ pageSize: 20, searchKey: '产品 文档' });
    await client.datasets.get({ id: '507f1f77bcf86cd799439011' });
    await client.datasets.delete({ id: '507f1f77bcf86cd799439011' });
    await client.datasets.collections.importFile(
      { datasetId: '507f1f77bcf86cd799439011' },
      { file: new Blob(['hello']), filename: '手册.txt' }
    );
    expect(requests.map((req) => req.method)).toEqual(['POST', 'GET', 'DELETE', 'POST']);
    expect(
      requests.every((req) => req.authorization === `Bearer ${apiKey}` && req.cookie === undefined)
    ).toBe(true);
    expect(requests[0].url).toBe('/prefix/api/core/dataset/listV2');
    expect(JSON.parse(requests[0].body.toString())).toEqual({
      pageSize: 20,
      searchKey: '产品 文档'
    });
    expect(requests[1].url).toContain('?id=507f1f77bcf86cd799439011');
    expect(requests[2].body.length).toBe(0);
    expect(requests[3].contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(requests[3].body.toString()).toContain(encodeURIComponent('手册.txt'));
    expect(requests[3].body.toString()).toContain('name="data"');
  });

  it('exposes every semantic SDK method with the registered HTTP contract', async () => {
    const client = new FastGPT({ baseURL, apiKey });
    for (const [operation, spec] of Object.entries(datasetOperations)) {
      respond = (_req, res) => {
        if ('download' in spec) {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end('archive');
        } else json(res, 'empty' in spec ? null : { ok: true });
      };
      const parts = operation.split('.');
      let target: unknown = client.datasets;
      for (const part of parts.slice(0, -1)) target = (target as Record<string, unknown>)[part];
      const method = (target as Record<string, unknown>)[parts.at(-1)!] as (
        ...args: unknown[]
      ) => Promise<unknown>;
      const result = await method.call(
        target,
        {},
        ...('upload' in spec ? [{ file: new Blob(['test']), filename: 'fixture.txt' }] : [])
      );
      const request = requests.at(-1)!;
      expect(request.url).toBe(`/prefix/api/${spec.path}`);
      expect(request.method).toBe(spec.method);
      expect(request.authorization).toBe(`Bearer ${apiKey}`);
      if ('download' in spec) expect(await (result as Response).text()).toBe('archive');
      else expect(result).toEqual('empty' in spec ? undefined : { ok: true });
    }
    expect(requests).toHaveLength(Object.keys(datasetOperations).length);
  });

  it('rejects missing, extra or invalid upload counts before sending a request', async () => {
    const client = new FastGPT({ baseURL, apiKey });
    await expect(
      client.datasets.execute('collections.importFile', { datasetId: 'id' })
    ).rejects.toThrow('requires a file');
    await expect(
      client.datasets.execute('collections.importFile', { datasetId: 'id' }, {}, [])
    ).rejects.toThrow('number of files');
    await expect(
      client.datasets.execute('list', {}, {}, { file: new Blob(), filename: 'x' })
    ).rejects.toThrow('does not accept files');
    expect(requests).toHaveLength(0);
  });

  it.each([
    { status: 401, code: 401 },
    { status: 200, code: 501001 },
    { status: 429, code: 429 }
  ])(
    'preserves HTTP status, business code and request ID for $status/$code',
    async ({ status, code }) => {
      respond = (_req, res) => json(res, null, status, code);
      const client = new FastGPT({ baseURL, apiKey });
      const error = await client.datasets.list().catch((error: unknown) => error);
      expect(error).toBeInstanceOf(FastGPTError);
      expect(error).toMatchObject({
        details: { status, code, requestId: 'request-123', kind: 'api' }
      });
      expect((error as Error).message).not.toContain(apiKey);
      expect(requests).toHaveLength(1);
    }
  );

  it.each(['<html>proxy error</html>', '{}', '{"code":"200"}'])(
    'rejects invalid server envelopes',
    async (body) => {
      respond = (_req, res) => {
        res.end(body);
      };
      await expect(new FastGPT({ baseURL, apiKey }).datasets.list()).rejects.toMatchObject({
        details: { kind: 'protocol' }
      });
    }
  );

  it('does not retry failed write requests', async () => {
    respond = (_req, res) => json(res, null, 503, 503);
    await expect(
      new FastGPT({ baseURL, apiKey }).datasets.create({ name: 'test', type: 'dataset', intro: '' })
    ).rejects.toBeInstanceOf(FastGPTError);
    expect(requests).toHaveLength(1);
  });

  it('distinguishes timeout, caller cancellation and network failure', async () => {
    respond = () => {};
    const client = new FastGPT({ baseURL, apiKey, timeoutMs: 20 });
    await expect(client.datasets.list()).rejects.toMatchObject({ details: { kind: 'timeout' } });
    await expect(client.datasets.list({}, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      details: { kind: 'aborted' }
    });
    await expect(
      new FastGPT({ baseURL: 'http://127.0.0.1:1', apiKey }).datasets.list()
    ).rejects.toMatchObject({ details: { kind: 'network' } });
  });

  it('keeps timeout and cancellation active while reading the response body', async () => {
    respond = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"code":200,"data":');
    };
    const client = new FastGPT({ baseURL, apiKey, timeoutMs: 80 });
    await expect(client.datasets.list()).rejects.toMatchObject({ details: { kind: 'timeout' } });
    const controller = new AbortController();
    const pending = client.datasets.list({}, { signal: controller.signal, timeoutMs: 5000 });
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toMatchObject({ details: { kind: 'aborted' } });
  });

  it('reports unserializable parameters before making a request', async () => {
    const input = { name: 'circular', extra: {} };
    input.extra = input;
    await expect(new FastGPT({ baseURL, apiKey }).datasets.create(input)).rejects.toBeInstanceOf(
      TypeError
    );
    expect(requests).toHaveLength(0);
  });

  it('rejects redirects rather than forwarding authentication', async () => {
    respond = (_req, res) => {
      res.writeHead(302, { location: `${baseURL}/other` });
      res.end();
    };
    await expect(new FastGPT({ baseURL, apiKey }).datasets.list()).rejects.toMatchObject({
      details: { kind: 'network' }
    });
    expect(requests).toHaveLength(1);
  });

  it('supports empty responses and rejects JSON masquerading as a download', async () => {
    respond = (_req, res) => {
      res.writeHead(204);
      res.end();
    };
    expect(await new FastGPT({ baseURL, apiKey }).datasets.delete({ id: 'id' })).toBeUndefined();
    respond = (_req, res) => json(res, {});
    await expect(
      new FastGPT({ baseURL, apiKey }).datasets.collections.download({ ticket: 'ticket' })
    ).rejects.toMatchObject({ details: { kind: 'protocol' } });
  });

  it.each([
    { baseURL: 'file:///tmp/test', apiKey },
    { baseURL: 'http://user:password@localhost', apiKey },
    { baseURL: 'http://localhost?x=1', apiKey },
    { baseURL, apiKey: '' },
    { baseURL, apiKey: 'Bearer key' },
    { baseURL, apiKey, timeoutMs: 0 }
  ])('rejects invalid client configuration', (options) => {
    expect(() => new FastGPT({ ...options, baseURL: options.baseURL ?? baseURL })).toThrow();
  });
});

const trainingStatus = (
  active = 0,
  failed = 0
): Pick<
  DatasetOutput<'collections.get'>,
  'activeTrainingAmount' | 'finalErrorAmount' | 'indexAmount'
> => ({
  activeTrainingAmount: active,
  finalErrorAmount: failed,
  indexAmount: active ? 0 : 1
});

describe('collection training lifecycle', () => {
  it('waits on the selected collection and reports progress until processing completes', async () => {
    let calls = 0;
    respond = (_req, res) => json(res, trainingStatus(calls++ === 0 ? 1 : 0));
    const progress: number[] = [];
    const result = await new FastGPT({ baseURL, apiKey }).datasets.collections.waitForReady(
      { id: 'collection' },
      {
        pollIntervalMs: 1,
        onProgress: (value) => progress.push(value.activeTrainingAmount)
      }
    );
    expect(result.indexAmount).toBe(1);
    expect(progress).toEqual([1, 0]);
    expect(requests.every((request) => request.url.endsWith('id=collection'))).toBe(true);
  });

  it('distinguishes final errors from queued work and bounds the entire waiting period', async () => {
    const client = new FastGPT({ baseURL, apiKey });
    respond = (_req, res) => json(res, trainingStatus(0, 1));
    await expect(client.datasets.collections.waitForReady({ id: 'x' })).rejects.toMatchObject({
      details: { kind: 'training' }
    });
    respond = (_req, res) => json(res, trainingStatus(1));
    await expect(
      client.datasets.collections.waitForReady(
        { id: 'x' },
        { waitTimeoutMs: 30, pollIntervalMs: 100 }
      )
    ).rejects.toMatchObject({ details: { kind: 'timeout' } });
    await expect(
      client.datasets.collections.waitForReady({ id: 'x' }, { signal: AbortSignal.abort() })
    ).rejects.toMatchObject({ details: { kind: 'aborted' } });
    await expect(
      client.datasets.collections.waitForReady({ id: 'x' }, { pollIntervalMs: 0 })
    ).rejects.toBeInstanceOf(TypeError);
  });
});
