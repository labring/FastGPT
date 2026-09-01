import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getSystemModelConfig: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  getSystemModelConfig: mocks.getSystemModelConfig
}));

import handler from '@/pages/api/admin/settings/model/getDefaultConfig';

describe('GET /api/admin/settings/model/getDefaultConfig', () => {
  const modelId = '68ad85a7463006c963799a05';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.getSystemModelConfig.mockResolvedValue({
      type: 'llm',
      provider: 'openai',
      model: 'gpt-4o',
      name: 'GPT-4o',
      scope: 'system' as const,
      isActive: true,
      config: {
        maxContext: 128000,
        maxResponse: 16384,
        quoteMaxToken: 100000
      }
    });
  });

  it('loads the plugin template by modelId', async () => {
    const result = await handler({ query: { modelId } } as any, {} as any);

    expect(mocks.getSystemModelConfig).toHaveBeenCalledWith(modelId);
    expect(result).toMatchObject({ model: 'gpt-4o' });
  });

  it('rejects a legacy model reference', async () => {
    await expect(handler({ query: { model: 'gpt-4o' } } as any, {} as any)).rejects.toBeInstanceOf(
      ApiRequestInputParseError
    );
    expect(mocks.getSystemModelConfig).not.toHaveBeenCalled();
  });
});
