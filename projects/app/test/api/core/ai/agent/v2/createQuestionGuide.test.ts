import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  getAppLatestVersion: vi.fn(),
  getLLMModelData: vi.fn(),
  getDefaultModelData: vi.fn(),
  getAuthorizedModelIds: vi.fn(),
  createQuestionGuide: vi.fn(),
  getChatItems: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/core/chat/auth', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: async () => ({
    getModelData: mocks.getLLMModelData,
    getLLMModelData: mocks.getLLMModelData,
    getDefaultModelData: mocks.getDefaultModelData
  }),
  getTeamModelHandle: async () => ({
    getModelData: mocks.getLLMModelData,
    getLLMModelData: mocks.getLLMModelData,
    getDefaultModelData: mocks.getDefaultModelData
  })
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: mocks.getAuthorizedModelIds
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
      isRoot: false,
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
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });

    expect(mocks.createQuestionGuide).not.toHaveBeenCalled();
  });

  it('enforces model resource check when only legacy model is configured', async () => {
    await expect(
      handler(
        {
          body: {
            appId: '65f000000000000000000071',
            chatId: 'chat-id',
            questionGuide: { open: true, model: 'legacy-model' }
          }
        } as any,
        {} as any
      )
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });

    expect(mocks.createQuestionGuide).not.toHaveBeenCalled();

    mocks.getAppLatestVersion.mockResolvedValueOnce({
      resources: [{ type: 'model', id: 'model-id' }],
      chatConfig: {}
    });
    mocks.createQuestionGuide.mockResolvedValue({
      result: ['q1'],
      inputTokens: 1,
      outputTokens: 1
    });

    await expect(
      handler(
        {
          body: {
            appId: '65f000000000000000000071',
            chatId: 'chat-id',
            questionGuide: { open: true, model: 'legacy-model' }
          }
        } as any,
        {} as any
      )
    ).resolves.toEqual(['q1']);

    expect(mocks.createQuestionGuide).toHaveBeenCalledOnce();
  });

  it('uses outLink actor semantics when falling back to the default LLM for share links', async () => {
    const authorizedIds = new Set(['default-llm']);
    const defaultModel = { modelId: 'default-llm', model: 'gpt-4o-mini' };
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      teamId: 'team-id',
      tmbId: 'publisher-tmb-id',
      isRoot: false,
      authType: AuthUserTypeEnum.outLink,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000071'
    });
    mocks.getLLMModelData.mockReturnValueOnce(undefined);
    mocks.getAuthorizedModelIds.mockResolvedValueOnce(authorizedIds);
    mocks.getDefaultModelData.mockReturnValueOnce(defaultModel);
    mocks.createQuestionGuide.mockResolvedValueOnce({
      result: ['q1'],
      inputTokens: 1,
      outputTokens: 1
    });

    await expect(
      handler(
        {
          body: {
            appId: '65f000000000000000000071',
            chatId: 'chat-id',
            outLinkAuthData: { shareId: 'share-id', outLinkUid: 'visitor-id' }
          }
        } as any,
        {} as any
      )
    ).resolves.toEqual(['q1']);

    expect(mocks.getAuthorizedModelIds).toHaveBeenCalledExactlyOnceWith({
      actor: { source: 'outLink', teamId: 'team-id', tmbId: 'publisher-tmb-id' },
      handle: expect.anything()
    });
    expect(mocks.getDefaultModelData).toHaveBeenCalledExactlyOnceWith('llm', { authorizedIds });
  });

  it('uses member actor semantics when falling back to the default LLM for token callers', async () => {
    const authorizedIds = new Set(['default-llm']);
    const defaultModel = { modelId: 'default-llm', model: 'gpt-4o-mini' };
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      teamId: 'team-id',
      tmbId: 'member-tmb-id',
      isRoot: true,
      authType: AuthUserTypeEnum.token,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000071'
    });
    mocks.getLLMModelData.mockReturnValueOnce(undefined);
    mocks.getAuthorizedModelIds.mockResolvedValueOnce(authorizedIds);
    mocks.getDefaultModelData.mockReturnValueOnce(defaultModel);
    mocks.createQuestionGuide.mockResolvedValueOnce({
      result: ['q1'],
      inputTokens: 1,
      outputTokens: 1
    });

    await expect(
      handler(
        {
          body: {
            appId: '65f000000000000000000071',
            chatId: 'chat-id'
          }
        } as any,
        {} as any
      )
    ).resolves.toEqual(['q1']);

    expect(mocks.getAuthorizedModelIds).toHaveBeenCalledExactlyOnceWith({
      actor: { teamId: 'team-id', tmbId: 'member-tmb-id', isRoot: true },
      handle: expect.anything()
    });
    expect(mocks.getDefaultModelData).toHaveBeenCalledExactlyOnceWith('llm', { authorizedIds });
  });
});
