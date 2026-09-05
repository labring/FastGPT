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

  it('ignores incomplete price fields when testing a draft model', async () => {
    await handler(
      {
        method: 'POST',
        body: {
          modelData: {
            type: installedModel.type,
            provider: installedModel.provider,
            model: 'draft-with-empty-price',
            name: 'Draft with empty price',
            scope: installedModel.scope,
            config: installedModel.config,
            priceTiers: [
              {
                minInputTokens: 0,
                inputPrice: undefined,
                outputPrice: undefined
              }
            ]
          },
          channelId: 9
        }
      } as any,
      {} as any
    );

    expect(mocks.createLLMResponse).toHaveBeenCalledWith(
      expect.objectContaining({ custonHeaders: { 'Aiproxy-Channel': '9' } })
    );
    const testedModel = mocks.createLLMResponse.mock.calls[0]?.[0]?.body?.model;
    expect(testedModel).toMatchObject({ model: 'draft-with-empty-price' });
    expect(testedModel).not.toHaveProperty('priceTiers');
  });

  it('tests a draft text-to-speech model with its configured voice', async () => {
    const createSpeech = vi.fn().mockResolvedValue({});
    mocks.getAIApi.mockReturnValue({
      ai: { audio: { speech: { create: createSpeech } } }
    });

    await handler(
      {
        method: 'POST',
        body: {
          modelData: {
            type: ModelTypeEnum.tts,
            provider: 'Custom provider',
            model: 'draft-tts',
            name: 'Draft TTS',
            scope: ModelScopeEnum.system,
            isActive: false,
            config: { voices: [{ label: 'Alloy', value: 'alloy' }] }
          },
          channelId: 10
        }
      } as any,
      {} as any
    );

    expect(createSpeech).toHaveBeenCalledWith(
      {
        model: 'draft-tts',
        voice: 'alloy',
        input: 'Hi',
        response_format: 'mp3',
        speed: 1
      },
      { headers: { 'Aiproxy-Channel': '10' } }
    );
  });

  it('rejects a draft text-to-speech model without a voice', async () => {
    await expect(
      handler(
        {
          method: 'POST',
          body: {
            modelData: {
              type: ModelTypeEnum.tts,
              provider: 'OpenAI',
              model: 'draft-tts',
              name: 'Draft TTS',
              scope: ModelScopeEnum.system,
              isActive: false,
              config: { voices: [] }
            },
            channelId: 10
          }
        } as any,
        {} as any
      )
    ).rejects.toMatchObject({ name: 'ApiRequestInputParseError' });
    expect(mocks.getAIApi).not.toHaveBeenCalled();
  });

  it('tests an embedding model through the selected channel', async () => {
    const vectors = [{ embedding: [0.1, 0.2], index: 0 }];
    mocks.findModelData.mockReturnValue({
      ...installedModel,
      type: ModelTypeEnum.embedding
    });
    mocks.getVectors.mockResolvedValue(vectors);

    const result = await handler(
      { query: { modelId: installedModel.modelId, channelId: 11 } } as any,
      {} as any
    );

    expect(result).toEqual(vectors);
    expect(mocks.getVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [{ type: 'text', input: 'Hi' }],
        headers: { 'Aiproxy-Channel': '11' },
        model: expect.objectContaining({ requestUrl: undefined, requestAuth: undefined })
      })
    );
  });

  it('tests a rerank model through the selected channel', async () => {
    mocks.findModelData.mockReturnValue({
      ...installedModel,
      type: ModelTypeEnum.rerank
    });
    mocks.reRankRecall.mockResolvedValue([{ id: '1', score: 1 }]);

    await expect(
      handler({ query: { modelId: installedModel.modelId, channelId: 12 } } as any, {} as any)
    ).resolves.toBeUndefined();
    expect(mocks.reRankRecall).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Hi',
        documents: [{ id: '1', text: 'Hi' }],
        headers: { 'Aiproxy-Channel': '12' },
        model: expect.objectContaining({ requestUrl: undefined, requestAuth: undefined })
      })
    );
  });

  it('tests a text-to-speech model through the selected channel', async () => {
    const createSpeech = vi.fn().mockResolvedValue({});
    mocks.findModelData.mockReturnValue({
      ...installedModel,
      type: ModelTypeEnum.tts,
      config: { voices: [{ label: 'Alloy', value: 'alloy' }] }
    });
    mocks.getAIApi.mockReturnValue({
      ai: { audio: { speech: { create: createSpeech } } }
    });

    await expect(
      handler({ query: { modelId: installedModel.modelId, channelId: 13 } } as any, {} as any)
    ).resolves.toBeUndefined();
    expect(createSpeech).toHaveBeenCalledWith(
      {
        model: installedModel.model,
        voice: 'alloy',
        input: 'Hi',
        response_format: 'mp3',
        speed: 1
      },
      { headers: { 'Aiproxy-Channel': '13' } }
    );
  });

  it('rejects an installed text-to-speech model without a voice', async () => {
    mocks.findModelData.mockReturnValue({
      ...installedModel,
      type: ModelTypeEnum.tts,
      config: { voices: [] }
    });

    await expect(
      handler({ query: { modelId: installedModel.modelId, channelId: 13 } } as any, {} as any)
    ).rejects.toMatchObject({
      name: 'UserError',
      message: 'TTS model test requires at least one voice'
    });
    expect(mocks.getAIApi).not.toHaveBeenCalled();
  });

  it('tests a speech-to-text model through the selected channel', async () => {
    mocks.findModelData.mockReturnValue({
      ...installedModel,
      type: ModelTypeEnum.stt
    });
    mocks.aiTranscriptions.mockResolvedValue({ text: 'Hi' });

    await expect(
      handler({ query: { modelId: installedModel.modelId, channelId: 14 } } as any, {} as any)
    ).resolves.toBeUndefined();
    expect(mocks.aiTranscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'test.mp3',
        headers: { 'Aiproxy-Channel': '14' },
        model: expect.objectContaining({ requestUrl: undefined, requestAuth: undefined })
      })
    );
  });
});
