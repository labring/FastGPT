import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chatCompletion', () => ({
  authChatCompletionHeaderRequest: mocks.authChatCompletionHeaderRequest
}));

type ProfilePayload = {
  ok: boolean;
  error?: string;
};

let handler: (req: any, res: any) => Promise<unknown>;
let serviceEnv: typeof import('@fastgpt/service/env').serviceEnv;

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

const createRes = () => ({
  end: vi.fn(),
  json: vi.fn(),
  status: vi.fn().mockReturnThis()
});

describe('v2 chat completion profile status', () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ serviceEnv } = await import('@fastgpt/service/env'));
    serviceEnv.REQUEST_PROFILE_ENABLE = true;
    serviceEnv.REQUEST_PROFILE_SAMPLE_RATE = 1;
    process.env.REQUEST_PROFILE_ENABLE = 'true';
    process.env.REQUEST_PROFILE_SAMPLE_RATE = '1';
    handler = (await import('@/pages/api/v2/chat/completions')).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIpFromRequest.mockReturnValue('127.0.0.1');
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

  afterAll(() => {
    serviceEnv.REQUEST_PROFILE_ENABLE = false;
    serviceEnv.REQUEST_PROFILE_SAMPLE_RATE = 1;
    delete process.env.REQUEST_PROFILE_ENABLE;
    delete process.env.REQUEST_PROFILE_SAMPLE_RATE;
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
    await handler({ headers: {}, method: 'POST' }, res);

    const profile = getLastProfile();
    expect(profile.ok).toBe(false);
    expect(profile.error).toContain('auth failed');
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

    await handler({ headers: {}, method: 'POST' }, createRes());

    const profile = getLastProfile();
    expect(profile.ok).toBe(false);
    expect(profile.error).toBeUndefined();
  });
});
