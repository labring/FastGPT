import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findModelData: vi.fn()
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
    isCustom: false,
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
  });

  it('returns the complete editable model without list desensitization', async () => {
    const result = await handler({ query: { modelId } } as any, {} as any);

    expect(mocks.findModelData).toHaveBeenCalledWith({ modelId });
    expect(result).toEqual(fullModel);
    expect(result.config).toMatchObject({
      defaultSystemChatPrompt: 'private prompt',
      defaultConfig: { temperature: 0.2 },
      fieldMap: { max_tokens: 'max_completion_tokens' }
    });
  });
});
