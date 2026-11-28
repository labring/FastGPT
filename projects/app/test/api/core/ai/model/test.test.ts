import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authModelScope: vi.fn(),
  authModelConfig: vi.fn(),
  resolveChannelForOperation: vi.fn(),
  testModelConnection: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/core/ai/model/auth', () => ({
  authModelScope: mocks.authModelScope,
  authModelConfig: mocks.authModelConfig
}));
vi.mock('@fastgpt/service/core/ai/model/channel/resolve', () => ({
  resolveChannelForOperation: mocks.resolveChannelForOperation
}));
vi.mock('@fastgpt/service/core/ai/model/test', () => ({
  testModelConnection: mocks.testModelConnection
}));

import handler from '@/pages/api/core/ai/model/test';

const MODEL_ID = '68ad85a7463006c963799a05';
const TEAM_ID = '6000000000000000000000aa';
const TMB_ID = '60000000000000000000000a';

const draftModelData = {
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  config: {
    maxContext: 16000,
    maxResponse: 4000,
    quoteMaxToken: 8000
  }
};

const makeInstalledModel = (scope: ModelScopeEnum): AIModelDataType => ({
  modelId: MODEL_ID,
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  scope,
  isActive: true,
  requestUrl: 'https://custom.example.com/v1/chat/completions',
  requestAuth: 'sk-custom',
  ...(scope === ModelScopeEnum.team && { teamId: TEAM_ID, tmbId: TMB_ID }),
  config: {
    maxContext: 16000,
    maxResponse: 4000,
    quoteMaxToken: 8000
  }
});

/** 构造真实 Node HTTP 载体上的类型化 NextApiRequest / NextApiResponse，避免局部对象强转。 */
const createHttpContext = ({
  method,
  body,
  query = {}
}: {
  method: 'GET' | 'POST';
  body?: unknown;
  query?: NextApiRequest['query'];
}): { req: NextApiRequest; res: NextApiResponse } => {
  const socket = new Socket();
  const req: NextApiRequest = Object.assign(new IncomingMessage(socket), {
    method,
    url: '/api/core/ai/model/test',
    cookies: {},
    env: {},
    body,
    query
  });

  function redirect(url: string): NextApiResponse;
  function redirect(status: number, url: string): NextApiResponse;
  function redirect(): NextApiResponse {
    return res;
  }

  const res: NextApiResponse = Object.assign(new ServerResponse(req), {
    send: vi.fn(() => undefined),
    json: vi.fn(() => undefined),
    status(statusCode: number) {
      res.statusCode = statusCode;
      return res;
    },
    redirect,
    setDraftMode: () => res,
    setPreviewData: () => res,
    clearPreviewData: () => res,
    revalidate: async () => undefined
  });

  onTestFinished(() => {
    res.destroy();
    socket.destroy();
  });

  return { req, res };
};

describe('/api/core/ai/model/test channel ownership verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authModelScope.mockResolvedValue({ teamId: TEAM_ID, tmbId: TMB_ID });
    mocks.resolveChannelForOperation.mockResolvedValue({ id: 7 });
    mocks.testModelConnection.mockResolvedValue(undefined);
  });

  it.each(['system', 'team'] as const)(
    'verifies %s channel ownership before running draft model test',
    async (channelType) => {
      const { req, res } = createHttpContext({
        method: 'POST',
        body: {
          channelType,
          channelId: 7,
          modelData: draftModelData
        }
      });

      await handler(req, res);

      expect(mocks.resolveChannelForOperation).toHaveBeenCalledExactlyOnceWith({
        id: 7,
        channelType,
        tmbId: TMB_ID
      });
      expect(mocks.testModelConnection).toHaveBeenCalledExactlyOnceWith({
        model: expect.objectContaining({
          model: 'gpt-4o-mini',
          scope: channelType === 'team' ? ModelScopeEnum.team : ModelScopeEnum.system,
          requestUrl: undefined,
          requestAuth: undefined
        }),
        teamId: TEAM_ID,
        channelId: 7
      });
      expect(mocks.resolveChannelForOperation.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.testModelConnection.mock.invocationCallOrder[0]
      );
    }
  );

  it('rejects draft model test without channelId during input validation', async () => {
    const { req, res } = createHttpContext({
      method: 'POST',
      body: {
        channelType: 'team',
        modelData: draftModelData
      }
    });

    await expect(handler(req, res)).rejects.toBeInstanceOf(ApiRequestInputParseError);
    expect(mocks.authModelScope).not.toHaveBeenCalled();
    expect(mocks.resolveChannelForOperation).not.toHaveBeenCalled();
    expect(mocks.testModelConnection).not.toHaveBeenCalled();
  });

  it('blocks draft model test when channelId is outside the caller scope', async () => {
    mocks.resolveChannelForOperation.mockRejectedValueOnce(ModelErrEnum.channelNotExist);
    const { req, res } = createHttpContext({
      method: 'POST',
      body: {
        channelType: 'team',
        channelId: 999,
        modelData: draftModelData
      }
    });

    await expect(handler(req, res)).rejects.toBe(ModelErrEnum.channelNotExist);

    expect(mocks.testModelConnection).not.toHaveBeenCalled();
  });

  it.each(['system', 'team'] as const)(
    'verifies %s channel ownership before running installed model test and strips custom endpoint',
    async (channelType) => {
      const installed = makeInstalledModel(
        channelType === 'team' ? ModelScopeEnum.team : ModelScopeEnum.system
      );
      mocks.authModelConfig.mockResolvedValue({
        actor: { teamId: TEAM_ID, tmbId: TMB_ID },
        models: [installed]
      });
      const { req, res } = createHttpContext({
        method: 'GET',
        query: {
          modelId: MODEL_ID,
          channelType,
          channelId: '7'
        }
      });

      await handler(req, res);

      expect(mocks.resolveChannelForOperation).toHaveBeenCalledExactlyOnceWith({
        id: 7,
        channelType,
        tmbId: TMB_ID
      });
      expect(mocks.testModelConnection).toHaveBeenCalledExactlyOnceWith({
        model: expect.objectContaining({
          modelId: MODEL_ID,
          requestUrl: undefined,
          requestAuth: undefined
        }),
        teamId: TEAM_ID,
        channelId: 7
      });
      expect(mocks.resolveChannelForOperation.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.testModelConnection.mock.invocationCallOrder[0]
      );
    }
  );

  it('blocks installed model test when channelId is outside the caller scope', async () => {
    mocks.authModelConfig.mockResolvedValue({
      actor: { teamId: TEAM_ID, tmbId: TMB_ID },
      models: [makeInstalledModel(ModelScopeEnum.team)]
    });
    mocks.resolveChannelForOperation.mockRejectedValueOnce(ModelErrEnum.channelNotExist);
    const { req, res } = createHttpContext({
      method: 'GET',
      query: {
        modelId: MODEL_ID,
        channelType: 'team',
        channelId: '1'
      }
    });

    await expect(handler(req, res)).rejects.toBe(ModelErrEnum.channelNotExist);

    expect(mocks.testModelConnection).not.toHaveBeenCalled();
  });

  it('skips channel resolution and keeps custom endpoint when channelId is omitted on GET', async () => {
    const installed = makeInstalledModel(ModelScopeEnum.team);
    mocks.authModelConfig.mockResolvedValue({
      actor: { teamId: TEAM_ID, tmbId: TMB_ID },
      models: [installed]
    });
    const { req, res } = createHttpContext({
      method: 'GET',
      query: {
        modelId: MODEL_ID,
        channelType: 'team'
      }
    });

    await handler(req, res);

    expect(mocks.resolveChannelForOperation).not.toHaveBeenCalled();
    expect(mocks.testModelConnection).toHaveBeenCalledExactlyOnceWith({
      model: installed,
      teamId: TEAM_ID,
      channelId: undefined
    });
  });
});
