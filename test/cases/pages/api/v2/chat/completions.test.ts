import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/v2/chat/completions';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { jsonRes, responseWrite, sseErrRes } from '@fastgpt/service/common/response';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getChatItems } from '@fastgpt/service/core/chat/controller';

vi.mock('@fastgpt/service/core/app/schema');
vi.mock('@fastgpt/service/core/chat/chatSchema');
vi.mock('@fastgpt/service/support/permission/auth/common');
vi.mock('@fastgpt/service/support/permission/auth/team');
vi.mock('@fastgpt/service/support/user/team/utils');
vi.mock('@fastgpt/service/core/workflow/dispatch');
vi.mock('@fastgpt/service/core/app/version/controller');
vi.mock('@fastgpt/service/common/response');
vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@fastgpt/service/core/chat/controller');
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn()
  }
}));
vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: () => 'en'
}));
vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  saveChat: vi.fn(),
  updateInteractiveChat: vi.fn()
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsage: vi.fn()
}));

describe('chat completions handler', () => {
  const mockReq = {
    body: {
      appId: 'app-123',
      messages: [
        {
          role: 'user',
          content: 'test message'
        }
      ],
      stream: false,
      detail: false,
      variables: {},
      responseChatItemId: 'chat-123'
    },
    headers: {
      authorization: 'Bearer test-token',
      origin: 'http://localhost:3000'
    }
  } as unknown as NextApiRequest;

  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    write: vi.fn()
  } as unknown as NextApiResponse;

  const mockApp = {
    _id: 'app-123',
    teamId: 'team-123',
    tmbId: 'tmb-123',
    name: 'Test App',
    modules: [],
    type: AppTypeEnum.chat,
    version: 'v2'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(MongoApp.findById).mockResolvedValue(mockApp as any);

    vi.mocked(MongoChat.findOne).mockImplementation(
      () =>
        ({
          lean: () => null
        }) as any
    );

    vi.mocked(authCert).mockResolvedValue({
      appId: undefined,
      teamId: 'team-123',
      tmbId: 'tmb-123',
      authType: AuthUserTypeEnum.token,
      sourceName: 'test',
      apikey: ''
    } as any);

    vi.mocked(authApp).mockResolvedValue({
      app: mockApp
    } as any);

    vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
      timezone: 'UTC',
      externalProvider: {}
    } as any);

    vi.mocked(getRunningUserInfoByTmbId).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123'
    } as any);

    vi.mocked(getAppLatestVersion).mockResolvedValue({
      nodes: [],
      edges: [],
      chatConfig: {}
    } as any);

    vi.mocked(getChatItems).mockResolvedValue({
      histories: []
    } as any);

    vi.mocked(dispatchWorkFlow).mockResolvedValue({
      flowResponses: [],
      flowUsages: [],
      assistantResponses: [{ text: { content: 'Test response' } }],
      newVariables: {},
      durationSeconds: 1,
      system_memories: []
    } as any);

    vi.mocked(jsonRes).mockImplementation((res, data) => {
      res.json(data);
      return true;
    });

    vi.mocked(responseWrite).mockImplementation(() => true);
  });

  it('should handle chat completion successfully', async () => {
    await handler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test response'
            },
            finish_reason: 'stop',
            index: 0
          }
        ]
      })
    );
  });

  it('should handle stream response', async () => {
    const streamReq = {
      ...mockReq,
      body: {
        ...mockReq.body,
        stream: true
      }
    } as NextApiRequest;

    await handler(streamReq, mockRes);

    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should handle errors', async () => {
    vi.mocked(authCert).mockRejectedValue(new Error('Auth error'));

    await handler(mockReq, mockRes);

    expect(jsonRes).toHaveBeenCalledWith(mockRes, {
      code: 500,
      error: expect.any(Error)
    });
  });

  it('should handle stream errors', async () => {
    const streamReq = {
      ...mockReq,
      body: {
        ...mockReq.body,
        stream: true
      }
    } as NextApiRequest;

    vi.mocked(authCert).mockRejectedValue(new Error('Stream error'));

    await handler(streamReq, mockRes);

    expect(sseErrRes).toHaveBeenCalledWith(mockRes, expect.any(Error));
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should handle plugin type app', async () => {
    const mockPluginApp = {
      ...mockApp,
      type: AppTypeEnum.plugin
    };

    vi.mocked(MongoApp.findById).mockResolvedValue(mockPluginApp as any);
    vi.mocked(authApp).mockResolvedValue({ app: mockPluginApp } as any);

    const pluginReq = {
      ...mockReq,
      body: {
        ...mockReq.body,
        detail: true,
        variables: {
          input: 'test input'
        }
      }
    } as NextApiRequest;

    await handler(pluginReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test response'
            },
            finish_reason: 'stop',
            index: 0
          }
        ]
      })
    );
  });

  it('should handle empty messages for non-plugin apps', async () => {
    const emptyMsgReq = {
      ...mockReq,
      body: {
        ...mockReq.body,
        messages: []
      }
    } as NextApiRequest;

    await handler(emptyMsgReq, mockRes);

    expect(jsonRes).toHaveBeenCalledWith(mockRes, {
      code: 500,
      error: expect.any(Error)
    });
  });
});
