import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/common/http/entry');

const mocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  authChatCompletionHeaderRequest: vi.fn(),
  getIpFromRequest: vi.fn(),
  jsonRes: vi.fn(),
  parseApiInput: vi.fn(),
  sseErrRes: vi.fn(),
  teamFrequencyLimit: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/logger')>();
  return {
    ...actual,
    getLogger: () => mocks.logger
  };
});

vi.mock('@fastgpt/service/common/response', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/response')>();
  return {
    ...actual,
    jsonRes: mocks.jsonRes,
    sseErrRes: mocks.sseErrRes
  };
});

vi.mock('@fastgpt/service/common/zod/requestParseError', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/zod/requestParseError')>();
  return {
    ...actual,
    parseApiInput: mocks.parseApiInput
  };
});

vi.mock('@fastgpt/service/common/geo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/geo')>();
  return {
    ...actual,
    getIpFromRequest: mocks.getIpFromRequest
  };
});

vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: {
    chat: 'chat'
  },
  teamFrequencyLimit: mocks.teamFrequencyLimit
}));

vi.mock('@fastgpt/next/middle/cors', () => ({
  parseAllowedOrigins: () => undefined,
  withNextCors: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/service/support/permission/auth/chatCompletion', () => ({
  authChatCompletionHeaderRequest: mocks.authChatCompletionHeaderRequest
}));

type ProfilePayload = {
  ok: boolean;
  error?: string;
};

let handler: (req: any, res: any) => Promise<unknown>;

const getLastProfile = (): ProfilePayload => {
  const profileCall = mocks.logger.info.mock.calls
    .map(([message]) => String(message))
    .findLast((message) => message.startsWith('Request profile '));

  expect(profileCall).toBeDefined();

  return JSON.parse(
    profileCall!
      .replace(/^Request profile /, '')
      .replaceAll('{{', '{')
      .replaceAll('}}', '}')
  ) as ProfilePayload;
};

const createRes = () => {
  const res = {
    statusCode: 200,
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
    headersSent: false,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    once: vi.fn(),
    end: vi.fn(() => {
      res.writableEnded = true;
    }),
    json: vi.fn(() => {
      res.writableEnded = true;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    })
  };
  return res;
};

const createReq = (profile = true) => ({
  headers: profile ? { 'x-fastgpt-profile': '1' } : {},
  method: 'POST',
  url: '/api/v2/chat/completions',
  socket: { remoteAddress: '127.0.0.1' }
});

describe('v2 chat completion profile status', () => {
  beforeAll(async () => {
    vi.resetModules();
    handler = (await import('@/pages/api/v2/chat/completions')).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIpFromRequest.mockReturnValue('127.0.0.1');
    mocks.jsonRes.mockImplementation((res, { code = 200, ...body }) => {
      res.status(code).json(body);
    });
    mocks.parseApiInput.mockReturnValue({
      body: {
        appId: 'app-id',
        chatId: 'chat-id',
        detail: false,
        messages: [],
        stream: false,
        variables: {}
      }
    });
  });

  it.each([false, true])('marks an auth failure as failed for stream=%s', async (stream) => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        appId: 'app-id',
        chatId: 'chat-id',
        detail: false,
        messages: [],
        stream,
        variables: {}
      }
    });
    mocks.authChatCompletionHeaderRequest.mockRejectedValue(new Error('auth failed'));

    const res = createRes();
    await handler(createReq(), res);

    const profile = getLastProfile();
    expect(profile.ok).toBe(false);
    expect(profile.error).toContain('auth failed');
    expect(
      mocks.logger.info.mock.calls.filter(([message]) =>
        String(message).startsWith('Request profile ')
      )
    ).toHaveLength(1);
    if (stream) {
      expect(mocks.sseErrRes).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    } else {
      expect(mocks.jsonRes).toHaveBeenCalled();
    }
  });

  it('marks a rate-limit response as failed', async () => {
    mocks.authChatCompletionHeaderRequest.mockResolvedValue({
      apikey: undefined,
      app: { _id: 'app-id' },
      authType: 'apikey',
      outLinkUserId: undefined,
      responseAllData: false,
      showCite: false,
      showRunningStatus: false,
      showSkillReferences: false,
      sourceName: '',
      teamId: 'team-id',
      tmbId: 'tmb-id'
    });
    mocks.teamFrequencyLimit.mockResolvedValue(false);

    await handler(createReq(), createRes());

    const profile = getLastProfile();
    expect(profile.ok).toBe(false);
    expect(profile.error).toBeUndefined();
  });

  it('未带 header 时不因业务报错自行启动采集', async () => {
    mocks.authChatCompletionHeaderRequest.mockRejectedValue(new Error('auth failed'));
    await handler(createReq(false), createRes());
    expect(
      mocks.logger.info.mock.calls.some(([message]) =>
        String(message).startsWith('Request profile ')
      )
    ).toBe(false);
    expect(mocks.jsonRes).toHaveBeenCalled();
  });

  it('中间件捕获的参数解析错误同样标记为失败', async () => {
    mocks.parseApiInput.mockImplementationOnce(() => {
      throw new Error('invalid input');
    });
    await handler(createReq(), createRes());
    expect(getLastProfile()).toMatchObject({ ok: false, error: 'invalid input' });
  });

  it('直接写回的 HTTP 错误状态由中间件统一标记', async () => {
    const { NextAPI } = await import('@/service/middleware/entry');
    await NextAPI(async (_req, res) => {
      res.status(429).end();
    })(createReq() as any, createRes() as any);
    expect(getLastProfile()).toMatchObject({ ok: false });
  });
});
