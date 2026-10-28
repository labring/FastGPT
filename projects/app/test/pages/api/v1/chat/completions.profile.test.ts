import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';

/**
 * v1 completions 的 SSE 错误以 HTTP 200 正常结束，共享入口无法按状态码识别失败。
 * 这个用例走真实的 NextAPI 入口与真实 ServerResponse，验证错误仍被标记为采集失败，
 * 同时响应协议保持原样（200 + SSE error 事件）。
 */

// 必须运行真实的共享入口与 SSE 响应，才能验证「HTTP 200 + SSE error」被正确归为失败。
vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

const authMocks = vi.hoisted(() => ({
  authChatCompletionHeaderRequest: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/logger')>();
  return {
    ...actual,
    getLogger: () => mockLogger
  };
});

vi.mock('@/service/support/permission/auth/chatCompletion', () => authMocks);

let handler: (req: any, res: any) => Promise<unknown>;

beforeAll(async () => {
  // setup 会通过 Mongo 提前加载采集器；重载后才能观察本文件注入的日志输出端。
  vi.resetModules();
  handler = (await import('@/pages/api/v1/chat/completions')).default as typeof handler;
});

const createHttpObjects = () => {
  const req: any = Object.assign(new IncomingMessage(new Socket()), {
    method: 'POST',
    url: '/api/v1/chat/completions',
    query: {},
    body: {
      appId: '68ad85a7463006c963799a05',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }]
    }
  });
  req.headers['x-fastgpt-profile'] = '1';

  const res: any = Object.assign(new ServerResponse(req), {
    status(status: number) {
      res.statusCode = status;
      return res;
    },
    json: vi.fn((data: unknown) => res.end(JSON.stringify(data)))
  });

  // 真实 SSE 写入用 `const Write = res.write` 的无绑定调用；测试里的 socket 未连接，
  // 需要先绑定，否则 Node 内部会因 this 丢失而报错。
  res.write = res.write.bind(res);

  onTestFinished(() => {
    res.destroy();
    req.socket.destroy();
  });

  return { req, res };
};

const getProfilePayloads = () =>
  mockLogger.info.mock.calls
    .filter(([message]) => String(message).startsWith('Request profile '))
    .map(([, payload]) => payload);

describe('v1 chat completions profile status', () => {
  it('marks the profile as failed when an auth error is written as an SSE error', async () => {
    authMocks.authChatCompletionHeaderRequest.mockRejectedValue(new Error('auth failed'));

    const { req, res } = createHttpObjects();
    const writeSpy = vi.spyOn(res, 'write');

    await handler(req, res);

    // 响应协议不变：HTTP 200 + SSE error 事件
    expect(res.statusCode).toBe(200);
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'API response stream failed',
      expect.anything()
    );
    expect(writeSpy.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('event: error');

    expect(getProfilePayloads()).toEqual([
      expect.objectContaining({
        kind: expect.stringContaining('/api/v1/chat/completions'),
        ok: false,
        error: 'auth failed'
      })
    ]);
  });
});
