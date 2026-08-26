import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

import handler from '@/pages/api/common/system/getSystemModels';

describe('GET /api/common/system/getSystemModels', () => {
  beforeEach(() => {
    const model = {
      modelId: '68ad85a7463006c963799a01',
      model: 'gpt-public',
      name: 'GPT Public',
      provider: 'openai',
      type: ModelTypeEnum.llm,
      isSystem: true as const,
      isActive: true,
      isCustom: false,
      requestUrl: 'https://private.example.com/v1',
      requestAuth: 'private-secret',
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 30000,
        defaultSystemChatPrompt: 'private prompt',
        defaultConfig: { private: true }
      }
    };

    global.systemModelMap = new Map([
      [`id:${model.modelId}`, model],
      [`model:${model.model}`, model]
    ]) as typeof global.systemModelMap;
  });

  it('returns each active model once and strips request secrets and private config', async () => {
    const result = await handler();

    expect(result).toEqual([
      {
        modelId: '68ad85a7463006c963799a01',
        model: 'gpt-public',
        name: 'GPT Public',
        provider: 'openai',
        type: ModelTypeEnum.llm,
        config: {
          maxContext: 128000
        }
      }
    ]);
    expect(result[0]).not.toHaveProperty('requestUrl');
    expect(result[0]).not.toHaveProperty('requestAuth');
  });
});
