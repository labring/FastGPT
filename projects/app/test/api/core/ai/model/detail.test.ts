import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findModelData: vi.fn(),
  getAdminAIProxyChannelItems: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  findModelData: mocks.findModelData
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/channel', () => ({
  getAdminAIProxyChannelItems: mocks.getAdminAIProxyChannelItems
}));

import handler from '@/pages/api/admin/settings/model/detail';

describe('GET /api/admin/settings/model/detail', () => {
  const modelId = '68ad85a7463006c963799a05';
  const fullModel = {
    modelId,
    type: 'llm' as const,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    scope: 'system' as const,
    isActive: true,
    requestUrl: 'https://example.com/v1',
    requestAuth: 'secret-token',
    config: {
      maxContext: 128000,
      maxResponse: 16384,
      quoteMaxToken: 100000,
      defaultSystemChatPrompt: 'private prompt',
      defaultConfig: { temperature: 0.2 },
      fieldMap: { max_tokens: 'max_completion_tokens' }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.findModelData.mockReturnValue(fullModel);
    mocks.getAdminAIProxyChannelItems.mockResolvedValue([
      {
        models: ['gpt-4o'],
        summary: {
          id: 1,
          name: 'OpenAI primary',
          protocol: {
            name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
            avatar: 'model/openai'
          },
          status: 1
        }
      },
      {
        models: ['other-model'],
        summary: {
          id: 2,
          name: 'OpenAI backup',
          protocol: {
            name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
            avatar: 'model/openai'
          },
          status: 2
        }
      }
    ]);
  });

  it('returns the complete editable model without list desensitization', async () => {
    const result = await handler({ query: { modelId } } as any, {} as any);

    expect(mocks.findModelData).toHaveBeenCalledWith({ modelId });
    expect(result.model).toEqual(fullModel);
    expect(result.model.config).toMatchObject({
      defaultSystemChatPrompt: 'private prompt',
      defaultConfig: { temperature: 0.2 },
      fieldMap: { max_tokens: 'max_completion_tokens' }
    });
    expect(result.channels).toEqual([
      expect.objectContaining({ id: 1, isAssociated: true }),
      expect.objectContaining({ id: 2, isAssociated: false })
    ]);
  });
});
