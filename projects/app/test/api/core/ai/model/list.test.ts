import { setModelTestSnapshot } from '@test/modelCache';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));

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
          scope: 'system',
          isActive: true,
          requestAuth: 'private-secret',
          priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }],
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

  it('returns only the public price projection', async () => {
    const result = await handler();

    expect(result).toEqual({
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
    expect(result.models[0]).not.toHaveProperty('modelId');
    expect(result.models[0]).not.toHaveProperty('requestAuth');
  });

  it('excludes team-scoped private models from the public list', async () => {
    setModelTestSnapshot({
      models: [
        {
          modelId: 'system-id',
          model: 'system-model',
          name: 'GPT Public',
          provider: 'openai',
          type: ModelTypeEnum.llm,
          scope: 'system',
          isActive: true,
          priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }],
          config: { maxContext: 128000, maxResponse: 16000, quoteMaxToken: 30000 }
        },
        {
          modelId: 'team-id',
          model: 'team-private-model',
          name: 'Team Secret Model',
          provider: 'openai',
          type: ModelTypeEnum.llm,
          scope: 'team',
          isActive: true,
          tmbId: 'some-member-id',
          priceTiers: [{ minInputTokens: 0, inputPrice: 10, outputPrice: 20 }],
          config: { maxContext: 128000, maxResponse: 16000, quoteMaxToken: 30000 }
        }
      ]
    });

    const result = await handler();

    expect(result.models).toHaveLength(1);
    expect(result.models[0].name).toBe('GPT Public');
  });
});
