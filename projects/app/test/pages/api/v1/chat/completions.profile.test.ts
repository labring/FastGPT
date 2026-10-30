import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

/**
 * v1 completions 的已处理错误和工作流错误摘要都可能以 HTTP 200 正常结束。
 * 运行真实的路由、NextAPI、采集器和 ServerResponse，仅替换工作流准备与执行依赖，
 * 验证 JSON/SSE 的失败分类和原有响应协议。
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

const workflowMocks = vi.hoisted(() => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/logger')>();
  return {
    ...actual,
    getLogger: () => mockLogger
  };
});

vi.mock('@/service/support/permission/auth/chatCompletion', () => authMocks);

vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: { chat: 'chat' },
  teamFrequencyLimit: vi.fn(async () => true)
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn(async () => ({
    versionId: 'version-1',
    nodes: [],
    edges: [],
    chatConfig: {},
    resources: []
  }))
}));

vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/fileLimits')>()),
  getWorkflowFileLimits: vi.fn(async () => ({ maxFileAmount: 5, maxBytesPerFile: 1024 }))
}));

vi.mock('@fastgpt/service/support/user/team/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/user/team/utils')>()),
  getRunningUserInfoByTmbId: vi.fn(async () => ({}))
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: vi.fn(async () => ({
    chatId: 'chat-1',
    responseChatItemId: 'response-1',
    shouldPersistChatRound: false,
    shouldFinalizePreparedRound: false
  }))
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => workflowMocks);

let handler: (req: any, res: any) => Promise<unknown>;

beforeAll(async () => {
  // setup 会通过 Mongo 提前加载采集器；重载后才能观察本文件注入的日志输出端。
  vi.resetModules();
  handler = (await import('@/pages/api/v1/chat/completions')).default as typeof handler;
});

const createHttpObjects = (stream = true) => {
  const req: any = Object.assign(new IncomingMessage(new Socket()), {
    method: 'POST',
    url: '/api/v1/chat/completions',
    query: {},
    body: {
      appId: '68ad85a7463006c963799a05',
      stream,
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
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.authChatCompletionHeaderRequest.mockResolvedValue({
      teamId: '67f4c91c79a4d61b1f116b2b',
      tmbId: '67f4c91c79a4d61b1f116b2c',
      authType: 'apikey',
      app: {
        _id: '68ad85a7463006c963799a05',
        name: 'Chat',
        type: AppTypeEnum.workflow
      }
    });
  });

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

  it.each([
    { stream: false, errorText: 'node failed' },
    { stream: true, errorText: 'node failed' },
    { stream: false, errorText: undefined },
    { stream: true, errorText: undefined }
  ])(
    'records a returned workflow error=$errorText for stream=$stream',
    async ({ stream, errorText }) => {
      workflowMocks.dispatchWorkFlow.mockResolvedValue({
        flowUsages: [],
        assistantResponses: [{ type: 'text', text: { content: 'answer' } }],
        newVariables: {},
        durationSeconds: 1,
        flatNodeResponses: [],
        workflowRuntimeSummary: { errorCount: errorText ? 1 : 0, errorText }
      });
      const { req, res } = createHttpObjects(stream);
      const writeSpy = vi.spyOn(res, 'write');

      await handler(req, res);

      expect(workflowMocks.dispatchWorkFlow).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(200);
      expect(res.writableEnded).toBe(true);
      const profiles = getProfilePayloads();
      expect(profiles).toEqual([expect.objectContaining({ ok: !errorText })]);
      expect(profiles[0].error).toBe(errorText);
      if (stream) {
        const response = writeSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
        expect(response).toContain('data: [DONE]');
        expect(response).not.toContain('event: error');
        expect(res.json).not.toHaveBeenCalled();
      } else {
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: errorText, choices: expect.any(Array) })
        );
      }
    }
  );
});
