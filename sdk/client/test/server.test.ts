import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  ApiDatasetHttpError,
  createApiDatasetHandler,
  toNodeHttpHandler,
  type ApiDatasetFileItem
} from '../src/server/apiDataset';

const sampleFiles: ApiDatasetFileItem[] = [
  {
    id: 'folder-1',
    parentId: null,
    name: '产品手册',
    type: 'folder',
    createTime: new Date('2026-01-01T00:00:00.000Z'),
    updateTime: new Date('2026-01-02T00:00:00.000Z')
  },
  {
    id: 'doc-1',
    parentId: 'folder-1',
    name: '快速入门.md',
    type: 'file',
    createTime: '2026-01-03T00:00:00.000Z',
    updateTime: '2026-01-04T00:00:00.000Z'
  }
];

const createTestHandler = (basePath?: string) =>
  createApiDatasetHandler({
    authorization: 'my-secret-kb-token',
    ...(basePath !== undefined ? { basePath } : {}),
    provider: {
      listFiles: ({ parentId, searchKey }) =>
        sampleFiles.filter((f) => {
          if (searchKey !== undefined) return f.name.includes(searchKey);
          if (parentId !== undefined) return f.parentId === parentId;
          return f.parentId === null;
        }),
      getFileContent: ({ id }) => {
        if (id === 'doc-1') return { title: '快速入门', content: '# Hello FastGPT' };
        if (id === 'forbidden') {
          throw new ApiDatasetHttpError({ status: 403, message: 'No access to document' });
        }
        return null;
      },
      getFileDetail: ({ id }) => sampleFiles.find((f) => f.id === id) ?? null,
      getFileReadUrl: ({ id }) => (id === 'doc-1' ? 'https://docs.example.com/doc-1' : null)
    }
  });

describe('@fastgpt/sdk/server Custom API Dataset Adapter', () => {
  it('fails fast at startup when authentication is omitted or empty unless allowAnonymous is explicitly true', async () => {
    const minimalProvider = {
      listFiles: () => sampleFiles,
      getFileContent: () => null,
      getFileDetail: () => null
    };

    // 1. 未传鉴权配置（或运行时 env 缺失传入 undefined）必须直接抛错，禁止静默退化为匿名模式
    expect(() =>
      createApiDatasetHandler({
        provider: minimalProvider
      })
    ).toThrow(/authentication is required/i);

    expect(() =>
      createApiDatasetHandler({
        authorization: undefined,
        provider: minimalProvider
      })
    ).toThrow(/authentication is required/i);

    // 2. 空串或纯空白令牌直接报错
    expect(() =>
      createApiDatasetHandler({
        authorization: '',
        provider: minimalProvider
      })
    ).toThrow(/non-empty string/i);

    expect(() =>
      createApiDatasetHandler({
        authorization: '   ',
        provider: minimalProvider
      })
    ).toThrow(/non-empty string/i);

    // 3. 显式开启 allowAnonymous: true 才允许无鉴权运行
    const anonHandler = createApiDatasetHandler({
      allowAnonymous: true,
      provider: minimalProvider
    });
    const res = await anonHandler(
      new Request('https://kb.example.com/v1/file/list', { method: 'POST', body: '{}' })
    );
    expect(res.status).toBe(200);
  });

  it('enforces Bearer authorization, basePath stripping, and all 4 custom API dataset routes', async () => {
    const handler = createTestHandler('/custom/kb');

    // 1. 缺失或错误令牌返回 401
    const unauthRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/list', { method: 'POST' })
    );
    expect(unauthRes.status).toBe(401);

    const wrongTokenRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/list', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-token' }
      })
    );
    expect(wrongTokenRes.status).toBe(401);

    const authHeaders = {
      authorization: 'Bearer my-secret-kb-token',
      'content-type': 'application/json'
    };

    // 2. POST /v1/file/list（含 Date 序列化与 hasChild 推导）
    const listRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/list', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({})
      })
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      success: boolean;
      data: Array<Record<string, unknown>>;
    };
    expect(listJson.success).toBe(true);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0]).toMatchObject({
      id: 'folder-1',
      hasChild: true,
      createTime: '2026-01-01T00:00:00.000Z'
    });

    // 3. GET /v1/file/content?id=doc-1 及 400 / 403 / 404 分支
    const contentRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/content?id=doc-1', {
        headers: authHeaders
      })
    );
    expect(contentRes.status).toBe(200);
    expect(await contentRes.json()).toEqual({
      success: true,
      message: '',
      data: { title: '快速入门', content: '# Hello FastGPT' }
    });

    const missingIdRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/content', { headers: authHeaders })
    );
    expect(missingIdRes.status).toBe(400);

    const forbiddenRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/content?id=forbidden', {
        headers: authHeaders
      })
    );
    expect(forbiddenRes.status).toBe(403);

    const missingFileRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/detail?id=not-exist', {
        headers: authHeaders
      })
    );
    expect(missingFileRes.status).toBe(404);

    // 4. GET /v1/file/read?id=doc-1 及 405 Method Not Allowed
    const readRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/read?id=doc-1', {
        headers: authHeaders
      })
    );
    expect(readRes.status).toBe(200);
    expect(await readRes.json()).toEqual({
      success: true,
      message: '',
      data: { url: 'https://docs.example.com/doc-1' }
    });

    const wrongMethodRes = await handler(
      new Request('https://kb.example.com/custom/kb/v1/file/list', {
        method: 'GET',
        headers: authHeaders
      })
    );
    expect(wrongMethodRes.status).toBe(405);
    expect(wrongMethodRes.headers.get('allow')).toBe('POST');
  });

  it('adapts cleanly to a real Node.js HTTP server via toNodeHttpHandler', async () => {
    const server = http.createServer(toNodeHttpHandler(createTestHandler()));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      const address = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${address.port}`;

      const listRes = await fetch(`${base}/v1/file/list`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer my-secret-kb-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ parentId: 'folder-1' })
      });
      expect(listRes.status).toBe(200);
      const listPayload = (await listRes.json()) as {
        success: boolean;
        data: Array<{ id: string }>;
      };
      expect(listPayload.success).toBe(true);
      expect(listPayload.data.map((item) => item.id)).toEqual(['doc-1']);

      const detailRes = await fetch(`${base}/v1/file/detail?id=doc-1`, {
        headers: { authorization: 'Bearer my-secret-kb-token' }
      });
      expect(detailRes.status).toBe(200);
      const detailPayload = (await detailRes.json()) as {
        success: boolean;
        data: { id: string; name: string; hasChild: boolean };
      };
      expect(detailPayload.data).toMatchObject({
        id: 'doc-1',
        name: '快速入门.md',
        hasChild: false
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
