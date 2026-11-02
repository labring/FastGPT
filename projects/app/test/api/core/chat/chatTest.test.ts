import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  createWorkflowResourceContext: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  getIpFromRequest: vi.fn(),
  prepareAppWorkflowResources: vi.fn(),
  sseErrRes: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatchWorkFlow
}));

vi.mock('@fastgpt/service/core/workflow/resource/context', () => ({
  createWorkflowResourceContext: mocks.createWorkflowResourceContext
}));

vi.mock('@fastgpt/service/core/app/resource/service', () => ({
  prepareAppWorkflowResources: mocks.prepareAppWorkflowResources
}));

vi.mock('@fastgpt/service/common/response', () => ({
  sseErrRes: mocks.sseErrRes
}));

vi.mock('@fastgpt/service/common/geo', () => ({
  getIpFromRequest: mocks.getIpFromRequest
}));

vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: { chat: 'chat' },
  teamFrequencyLimit: vi.fn()
}));

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: { teamChatQPM: vi.fn() }
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: () => 'zh-CN'
}));

vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', () => ({
  prepareWorkflowFileQuery: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/utils/streamResponseContext', () => ({
  createWorkflowStreamResponseContext: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: { findOne: vi.fn() }
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  failChatRound: vi.fn(),
  finalizeChatRound: vi.fn(),
  updateInteractiveChat: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/chatGenerateStatus', () => ({
  updateChatGenerateStatus: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: vi.fn()
}));

import handler from '@/pages/api/core/chat/chatTest';

const appId = '68ad85a7463006c963799a05';

const buildRequest = () => ({
  body: {
    messages: [{ role: 'user', content: 'hello' }],
    nodes: [],
    edges: [],
    chatConfig: {},
    appId,
    appName: 'test-app',
    chatId: 'chat-id'
  },
  headers: {}
});

describe('chatTest API permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIpFromRequest.mockReturnValue('127.0.0.1');
    mocks.authApp.mockRejectedValue(new Error('permission denied'));
  });

  it('requires write permission before executing request-provided workflow nodes', async () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      end: vi.fn()
    };

    await handler(buildRequest() as any, res as any);

    expect(mocks.authApp).toHaveBeenCalledWith(
      expect.objectContaining({ appId, per: WritePermissionVal })
    );
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
  });
});
