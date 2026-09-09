import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  getAppLatestVersion: vi.fn(),
  getLLMModelData: vi.fn(),
  createQuestionGuide: vi.fn(),
  getChatItems: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModelData: mocks.getLLMModelData,
  getDefaultLLMModelData: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/functions/createQuestionGuide', () => ({
  createQuestionGuide: mocks.createQuestionGuide
}));
vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: mocks.getChatItems
}));
vi.mock('@/service/support/wallet/usage/push', () => ({ pushQuestionGuideUsage: vi.fn() }));

import handler from '@/pages/api/core/ai/agent/v2/createQuestionGuide';

describe('createQuestionGuide model resource permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authChatTargetCrud.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000071'
    });
    mocks.getAppLatestVersion.mockResolvedValue({
      resources: [],
      chatConfig: {}
    });
    mocks.getLLMModelData.mockReturnValue({ modelId: 'model-id' });
    mocks.getChatItems.mockResolvedValue({ histories: [] });
  });

  it('rejects a model that is not declared by the published App version', async () => {
    await expect(
      handler(
        {
          body: {
            appId: '65f000000000000000000071',
            chatId: 'chat-id',
            questionGuide: { open: true, modelId: 'model-id' }
          }
        } as any,
        {} as any
      )
    ).rejects.toBe(ERROR_ENUM.unAuthModel);

    expect(mocks.createQuestionGuide).not.toHaveBeenCalled();
  });
});
