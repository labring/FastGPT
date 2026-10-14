import type { ApiRequestProps } from '@fastgpt/next/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { JSONRPCMessageSchema, isJSONRPCErrorResponse } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  LogCategories: { MODULE: { MCP: { APP: 'mcp.app' } } }
}));

vi.mock('@/service/support/mcp/utils', () => ({
  getMcpServerTools: mocks.getMcpServerTools,
  callMcpServerTool: mocks.callMcpServerTool
}));

vi.mock('@/service/support/mcp/auth', () => ({
  getMcpAuthProxyFromHeaders: mocks.getMcpAuthProxyFromHeaders
}));

import handler from '@/pages/api/mcp/app/[key]/mcp';

const createRes = () => {
  const res = {
    writableFinished: false,
    on: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
  return res;
};

const callPostHandler = async () => {
  const req = {
    method: 'POST',
    query: { key: 'test-key' },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
    headers: {}
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

    const res = await callPostHandler();

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
  });
});
