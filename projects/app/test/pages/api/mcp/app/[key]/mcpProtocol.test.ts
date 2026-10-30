import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 使用真实 MCP SDK + 真实 Node HTTP 验证协议层行为。
 *
 * 同目录的 mcp.test.ts mock 了 transport 与 Server，只能验证包装器逻辑；
 * 这里不 mock SDK，直接确认：
 * - 协议错误确实由 SDK 自行返回（406、200 + SSE 内的 JSON-RPC error），不经过业务 catch
 * - 这些响应会被标记为采集失败
 * - handleRequest 会等待工具执行完成后再返回
 */

const mocks = vi.hoisted(() => ({
  getMcpServerTools: vi.fn(),
  callMcpServerTool: vi.fn(),
  getMcpAuthProxyFromHeaders: vi.fn()
}));

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mockLogger,
  LogCategories: {
    MODULE: { MCP: { APP: 'mcp.app' } },
    REQUEST: { PROFILE: ['request', 'profile'] }
  }
}));

vi.mock('@/service/support/mcp/utils', () => ({
  getMcpServerTools: mocks.getMcpServerTools,
  callMcpServerTool: mocks.callMcpServerTool
}));

vi.mock('@/service/support/mcp/auth', () => ({
  getMcpAuthProxyFromHeaders: mocks.getMcpAuthProxyFromHeaders
}));

type ApiHandler = (req: any, res: any) => Promise<void> | void;

let handler: ApiHandler;
let httpServer: HttpServer;
let endpoint: string;

const getProfilePayloads = () =>
  mockLogger.info.mock.calls
    .filter(([message]) => String(message).startsWith('Request profile '))
    .map(([, payload]) => payload);

const postJsonRpc = (body: unknown, headers: Record<string, string>) =>
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });

beforeAll(async () => {
  // setup 会通过 Mongo 提前加载采集器；重载后才能观察本文件注入的日志输出端。
  vi.resetModules();
  handler = (await import('@/pages/api/mcp/app/[key]/mcp')).default as ApiHandler;

  httpServer = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');

    // 模拟 Next 在进入 handler 前注入的 query / body
    (req as any).query = { key: 'test-key' };
    (req as any).body = raw ? JSON.parse(raw) : undefined;

    await handler(req, res);
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/api/mcp/app/test-key/mcp`;
});

afterAll(async () => {
  httpServer.closeAllConnections();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('mcp app handler with the real MCP SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMcpAuthProxyFromHeaders.mockReturnValue({});
    mocks.getMcpServerTools.mockResolvedValue([]);
  });

  it('marks the profile as failed for the SDK-generated 406 response', async () => {
    // 缺少 text/event-stream，由 transport 直接返回 406，不抛异常
    const response = await postJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { accept: 'application/json', 'x-fastgpt-profile': '1' }
    );

    expect(response.status).toBe(406);
    const body = await response.json();
    expect(body).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });

    expect(getProfilePayloads()).toEqual([
      expect.objectContaining({ kind: 'mcp', ok: false, error: 'MCP responded 406' })
    ]);
  });

  it('marks the profile as failed for a JSON-RPC error sent over HTTP 200', async () => {
    // 缺少 params.name：SDK 参数校验失败，经 transport.send 返回 SSE 内的 JSON-RPC error
    const response = await postJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
      { accept: 'application/json, text/event-stream', 'x-fastgpt-profile': '1' }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"error"');
    // 参数校验在业务 handler 之前失败，工具不应被执行
    expect(mocks.callMcpServerTool).not.toHaveBeenCalled();

    const [profile] = getProfilePayloads();
    expect(profile).toMatchObject({ kind: 'mcp', ok: false });
    expect(profile.error).toBeTruthy();
  });

  it('waits for the tool result and records a successful profile', async () => {
    mocks.callMcpServerTool.mockResolvedValue('tool result');

    const response = await postJsonRpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search', arguments: { q: 'x' } }
      },
      { accept: 'application/json, text/event-stream', 'x-fastgpt-profile': '1' }
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('tool result');
    expect(mocks.callMcpServerTool).toHaveBeenCalledOnce();

    expect(getProfilePayloads()).toEqual([expect.objectContaining({ kind: 'mcp', ok: true })]);
  });
});
