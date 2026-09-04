import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findModelData: vi.fn(),
  createLLMResponse: vi.fn(),
  getVectors: vi.fn(),
  reRankRecall: vi.fn(),
  aiTranscriptions: vi.fn(),
  getAIApi: vi.fn(),
  debug: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/core/ai/model', () => ({ findModelData: mocks.findModelData }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mocks.createLLMResponse
}));
vi.mock('@fastgpt/service/core/ai/embedding', () => ({ getVectors: mocks.getVectors }));
vi.mock('@fastgpt/service/core/ai/rerank', () => ({ reRankRecall: mocks.reRankRecall }));
vi.mock('@fastgpt/service/core/ai/audio/transcriptions', () => ({
  aiTranscriptions: mocks.aiTranscriptions
}));
vi.mock('@fastgpt/service/core/ai/config', () => ({ getAIApi: mocks.getAIApi }));
vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: { MODULE: { AI: { MODEL: 'model' } } },
  getLogger: () => ({ debug: mocks.debug, info: vi.fn() })
}));

import handler from '@/pages/api/admin/settings/model/test';

const installedModel = {
  modelId: '68ad85a7463006c963799a05',
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-routing-model',
  name: 'Test routing model',
  scope: ModelScopeEnum.system,
  isActive: true,
  requestUrl: 'https://model.example.com/v1/chat/completions',
  requestAuth: 'model-secret',
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

describe('admin model test routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ teamId: 'root-team' });
    mocks.findModelData.mockReturnValue(installedModel);
    mocks.createLLMResponse.mockResolvedValue({ answerText: 'ok' });
  });

  it('uses an explicit channel on a request-local copy without mutating model connection data', async () => {
    const result = await handler(
      { query: { modelId: installedModel.modelId, channelId: 7 } } as any,
      {} as any
    );

    expect(result).toBe('ok');
    expect(mocks.createLLMResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'root-team',
        custonHeaders: { 'Aiproxy-Channel': '7' },
        body: expect.objectContaining({
          model: expect.objectContaining({
            modelId: installedModel.modelId,
            requestUrl: undefined,
            requestAuth: undefined
          })
        })
      })
    );
    expect(installedModel.requestUrl).toBe('https://model.example.com/v1/chat/completions');
    expect(installedModel.requestAuth).toBe('model-secret');
  });

  it('preserves model request configuration when no channel override is selected', async () => {
    await handler({ query: { modelId: installedModel.modelId } } as any, {} as any);

    expect(mocks.createLLMResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        custonHeaders: {},
        body: expect.objectContaining({ model: installedModel })
      })
    );
  });

  it('tests a draft model through the selected channel without resolving a persisted model', async () => {
    await handler(
      {
        method: 'POST',
        body: {
          modelData: {
            type: installedModel.type,
            provider: installedModel.provider,
            model: 'draft-routing-model',
            name: 'Draft routing model',
            scope: installedModel.scope,
            isActive: installedModel.isActive,
            requestUrl: installedModel.requestUrl,
            requestAuth: installedModel.requestAuth,
            config: installedModel.config
          },
          channelId: 9
        }
      } as any,
      {} as any
    );

    expect(mocks.findModelData).not.toHaveBeenCalled();
    expect(mocks.createLLMResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'root-team',
        custonHeaders: { 'Aiproxy-Channel': '9' },
        body: expect.objectContaining({
          model: expect.objectContaining({
            model: 'draft-routing-model',
            requestUrl: undefined,
            requestAuth: undefined
          })
        })
      })
    );
  });
});
