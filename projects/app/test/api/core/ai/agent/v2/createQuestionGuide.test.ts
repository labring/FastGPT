import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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

/** 构造真实 Node HTTP 载体上的类型化 NextApiRequest / NextApiResponse，避免局部对象强转。 */
const createHttpContext = (body: unknown): { req: NextApiRequest; res: NextApiResponse } => {
  const socket = new Socket();
  const req: NextApiRequest = Object.assign(new IncomingMessage(socket), {
    method: 'POST',
    url: '/api/core/ai/agent/v2/createQuestionGuide',
    cookies: {},
    env: {},
    body,
    query: {}
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
    const { req, res } = createHttpContext({
      appId: '65f000000000000000000071',
      chatId: 'chat-id',
      questionGuide: { open: true, modelId: 'model-id' }
    });

    await expect(handler(req, res)).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });

    expect(mocks.createQuestionGuide).not.toHaveBeenCalled();
  });

  it('enforces model resource check when only legacy model is configured', async () => {
    const unauthorizedCtx = createHttpContext({
      appId: '65f000000000000000000071',
      chatId: 'chat-id',
      questionGuide: { open: true, model: 'legacy-model' }
    });
    await expect(handler(unauthorizedCtx.req, unauthorizedCtx.res)).rejects.toMatchObject({
      message: ModelErrEnum.unAuthModel
    });

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
    const authorizedCtx = createHttpContext({
      appId: '65f000000000000000000071',
      chatId: 'chat-id',
      questionGuide: { open: true, model: 'legacy-model' }
    });

    await expect(handler(authorizedCtx.req, authorizedCtx.res)).resolves.toEqual(['q1']);

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
    const { req, res } = createHttpContext({
      appId: '65f000000000000000000071',
      chatId: 'chat-id',
      outLinkAuthData: { shareId: 'share-id', outLinkUid: 'visitor-id' }
    });

    await expect(handler(req, res)).resolves.toEqual(['q1']);

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
    const { req, res } = createHttpContext({
      appId: '65f000000000000000000071',
      chatId: 'chat-id'
    });

    await expect(handler(req, res)).resolves.toEqual(['q1']);

    expect(mocks.getAuthorizedModelIds).toHaveBeenCalledExactlyOnceWith({
      actor: { teamId: 'team-id', tmbId: 'member-tmb-id', isRoot: true },
      handle: expect.anything()
    });
    expect(mocks.getDefaultModelData).toHaveBeenCalledExactlyOnceWith('llm', { authorizedIds });
  });
});
