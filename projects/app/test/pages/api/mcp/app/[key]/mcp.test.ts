import type { ApiRequestProps } from '@fastgpt/next/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { JSONRPCMessageSchema, isJSONRPCErrorResponse } from '@modelcontextprotocol/sdk/types.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMcpServerTools: vi.fn(),
  callMcpServerTool: vi.fn(),
  getMcpAuthProxyFromHeaders: vi.fn(),
  handleRequest: vi.fn()
}));

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  class StreamableHTTPServerTransport {
    handleRequest = mocks.handleRequest;
    close = vi.fn();
  }
  return { StreamableHTTPServerTransport };
});

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  class Server {
    setRequestHandler = vi.fn();
    connect = vi.fn();
    close = vi.fn();
  }
  return { Server };
});

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

let handler: typeof import('@/pages/api/mcp/app/[key]/mcp').default;
let profiling: typeof import('@fastgpt/service/common/profiling');

beforeAll(async () => {
  // setup 会通过 Mongo 提前加载采集器；重载后才能观察本文件注入的日志输出端。
  vi.resetModules();
  profiling = await import('@fastgpt/service/common/profiling');
  handler = (await import('@/pages/api/mcp/app/[key]/mcp')).default;
});

const createRes = () => {
  const res = {
    writableFinished: false,
    on: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
  return res;
};

const callPostHandler = async (profile = false) => {
  const req = {
    method: 'POST',
    query: { key: 'test-key' },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
    headers: profile ? { 'x-fastgpt-profile': '1' } : {}
  } as unknown as ApiRequestProps;
  const res = createRes();
  await handler(req, res as any);
  return res;
};

describe('mcp app handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMcpAuthProxyFromHeaders.mockReturnValue({});
  });

  it.each([false, true])(
    '原生 MCP 只在显式 header 开启时采集，且不追加默认 JSON：%s',
    async (profile) => {
      mocks.getMcpServerTools.mockImplementationOnce(async () => {
        expect(profiling.isProfiling()).toBe(profile);
        return profiling.profileStage(
          { event: 'mcp.tools.list', params: { appCount: 1 } },
          () => []
        );
      });
      const res = await callPostHandler(profile);
      expect(res.json).not.toHaveBeenCalled();
      expect(mocks.handleRequest).toHaveBeenCalledOnce();
      expect(profiling.isProfiling()).toBe(false);
    }
  );

  it('returns a parseable JSON-RPC error with the original id when team cancellation is pending', async () => {
    // 注销守卫抛出的错误形态：new Error(TeamErrEnum.accountCancellationPending)
    mocks.getMcpServerTools.mockRejectedValue(new Error(TeamErrEnum.accountCancellationPending));

    const res = await callPostHandler();

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];

    // 错误响应必须带原请求 id，否则 MCP 客户端无法结束对应请求并会继续等待。
    expect(body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32000,
        // getErrText 会把已知错误码翻译为 i18n 文案
        message: 'common:code_error.account_cancellation_pending'
      }
    });

    // 响应体必须能被 MCP TS SDK 客户端解析为合法的 JSON-RPC 错误响应
    expect(() => JSONRPCMessageSchema.parse(body)).not.toThrow();
    expect(isJSONRPCErrorResponse(JSONRPCMessageSchema.parse(body))).toBe(true);
  });

  it('keeps legacy 500 response for unexpected errors', async () => {
    mocks.getMcpServerTools.mockRejectedValue(new Error('some other error'));

    const res = await callPostHandler();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null
    });
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns a parseable JSON-RPC error with the original id when the key is invalid', async () => {
    // key 不存在时的抛出形态：Promise.reject(裸字符串)，不是 Error 实例
    mocks.getMcpServerTools.mockRejectedValue(CommonErrEnum.invalidResource);

    const res = await callPostHandler(true);

    // 无效 key 属于客户端侧状态，不是服务端异常：返回可解析的 JSON-RPC 错误而非 500
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32000,
        message: 'common:error_invalid_resource'
      }
    });
    expect(() => JSONRPCMessageSchema.parse(body)).not.toThrow();
    expect(isJSONRPCErrorResponse(JSONRPCMessageSchema.parse(body))).toBe(true);

    // 日志降级为 warn，避免预期内的客户端错误污染服务端 error 指标
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
    const profiles = mockLogger.info.mock.calls.filter(([message]) =>
      String(message).startsWith('Request profile ')
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0][1]).toMatchObject({ kind: 'mcp', ok: false });
  });
});
