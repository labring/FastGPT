import { setModelTestSnapshot } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { GetSystemModelsResponse } from '@fastgpt/global/openapi/core/ai/model/api';
import { beforeEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/ai/model/list';

describe('GET /api/core/ai/model/list', () => {
  beforeEach(() => {
    setModelTestSnapshot({
      models: [
        {
          modelId: 'private-id',
          model: 'private-provider-name',
          name: 'GPT Public',
          provider: 'openai',
          type: ModelTypeEnum.llm,
          scope: ModelScopeEnum.system,
          isActive: true,
          requestAuth: 'private-secret',
          priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }],
          config: { maxContext: 128000, maxResponse: 16000, quoteMaxToken: 30000 }
        },
        {
          modelId: 'team-id',
          model: 'team-private-model',
          name: 'Team Secret Model',
          provider: 'openai',
          type: ModelTypeEnum.llm,
          scope: ModelScopeEnum.team,
          isActive: true,
          tmbId: 'some-member-id',
          priceTiers: [{ minInputTokens: 0, inputPrice: 10, outputPrice: 20 }],
          config: { maxContext: 128000, maxResponse: 16000, quoteMaxToken: 30000 }
        }
      ]
    });
    global.ModelProviderRawCache = [
      {
        provider: 'openai',
        value: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'openai.svg'
      }
    ];
  });

  it('returns only the public price projection of system models', async () => {
    const response = await Call<GetSystemModelsResponse>(handler);

    expect(response.code).toBe(200);
    expect(response.data).toEqual({
      models: [
        {
          name: 'GPT Public',
          provider: 'openai',
          type: ModelTypeEnum.llm,
          priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }],
          config: { maxContext: 128000 }
        }
      ],
      providers: global.ModelProviderRawCache
    });
  });
});
